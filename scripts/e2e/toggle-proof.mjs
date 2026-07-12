#!/usr/bin/env node
/**
 * toggle-proof.mjs — SPEC-006 Step 5: toggle-off zero-writes proof.
 *
 * Disables wallet-scoped KG ingestion, records the current session count for the
 * gate wallet, runs a rickydata-code chat, and asserts zero new sessions were
 * written in the disabled window.
 *
 * Run by the lead only. full-gate.mjs imports runToggleProof().
 */

import { randomUUID } from 'node:crypto';
import { kql } from './kql.mjs';

const GATE_WALLET = (process.env.RD_GATE_WALLET || '0xb3e6fa9620933ba9a6037f4ff890ec5fad0ba113').toLowerCase();
const AGENT_GATEWAY = (process.env.RD_AGENT_GATEWAY || 'https://agents.rickydata.org').replace(/\/+$/, '');
const WALLET_TOKEN = process.env.RD_WALLET_TOKEN || '';

/**
 * Disable KG ingestion for the gate wallet.
 * Evidence: mcp-agent-gateway/src/routes/wallet-routes.ts:452 (POST /wallet/knowledge-graph/disable)
 * clears the cached derive session and sets knowledgeGraphIngestion=false.
 */
async function disableIngestion() {
  if (!WALLET_TOKEN) {
    return { disabled: false, reason: 'RD_WALLET_TOKEN not set' };
  }
  try {
    const res = await fetch(`${AGENT_GATEWAY}/wallet/knowledge-graph/disable`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${WALLET_TOKEN}`, 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(15_000),
    });
    const body = await res.json().catch(() => ({}));
    return { disabled: res.ok && body.enabled === false, status: res.status, body };
  } catch (err) {
    return { disabled: false, reason: err.message };
  }
}

/**
 * Run a rickydata-code chat that SHOULD produce no capture (ingestion disabled).
 * TODO(WS-B): same chat invocation as remote-proof; with ingestion disabled the
 * gateway must not inject rd-plugin nor set RICKYDATA_KG_SINK, so no spool is
 * written. Until the chat wiring lands this returns { ran: false } and the step
 * still asserts zero-delta (which trivially holds), so mark inconclusive.
 */
async function runChatExpectingNoCapture(claudeSessionId) {
  return { ran: false, claudeSessionId, reason: 'gateway chat wiring not built yet (WS-B)' };
}

export async function runToggleProof() {
  const claudeSessionId = process.env.RD_TOGGLE_SID || randomUUID();
  const sinceMs = Date.now();
  const disabled = await disableIngestion();

  const countQuery = `MATCH (s:ClaudeCodeSession {wallet_address: $wallet})
                      WHERE s.started_at > $since
                      RETURN count(s) AS new_sessions`;
  const ran = disabled.disabled ? await runChatExpectingNoCapture(claudeSessionId) : { ran: false, reason: 'not disabled' };

  let newSessions = null;
  let queryError = null;
  if (disabled.disabled) {
    await new Promise((r) => setTimeout(r, 6000));
    try {
      const { data } = await kql(countQuery, { wallet: GATE_WALLET, since: sinceMs });
      newSessions = data.length ? Number(Object.values(data[0])[0]) : 0;
    } catch (err) {
      queryError = err.message;
    }
  }

  // Pass requires: ingestion actually disabled, the chat ran, and zero new sessions.
  const pass = disabled.disabled && ran.ran && newSessions === 0;
  return {
    step: 'toggle-proof',
    pass,
    claudeSessionId,
    wallet: GATE_WALLET,
    query: countQuery,
    result: { disabled, ran, sinceMs, newSessions, queryError },
    timestamp: new Date().toISOString(),
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runToggleProof()
    .then((r) => { console.log(JSON.stringify(r, null, 2)); process.exit(r.pass ? 0 : 1); })
    .catch((err) => { console.error(err.message); process.exit(1); });
}
