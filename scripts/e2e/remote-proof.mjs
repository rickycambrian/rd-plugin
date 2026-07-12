#!/usr/bin/env node
/**
 * remote-proof.mjs — SPEC-006 Step 2: remote gateway-sink proof.
 *
 * Enables wallet-scoped KG ingestion on the agent gateway, runs a rickydata-code
 * chat (which injects rd-plugin in gateway-sink mode), waits for the spool
 * ingestor, then asserts schema-v3 nodes appear under the gate wallet — proving
 * the gateway performed the wallet-scoped write with keys that never entered the
 * sandbox.
 *
 * Run by the lead only. full-gate.mjs imports runRemoteProof().
 */

import { randomUUID } from 'node:crypto';
import { kql } from './kql.mjs';

const GATE_WALLET = (process.env.RD_GATE_WALLET || '0xb3e6fa9620933ba9a6037f4ff890ec5fad0ba113').toLowerCase();
const AGENT_GATEWAY = (process.env.RD_AGENT_GATEWAY || 'https://agents.rickydata.org').replace(/\/+$/, '');
const WALLET_TOKEN = process.env.RD_WALLET_TOKEN || '';

/**
 * Enable KG ingestion for the gate wallet.
 * Evidence: mcp-agent-gateway/src/routes/wallet-routes.ts:400 (POST /wallet/knowledge-graph/enable).
 * The enable body needs { challenge_id, signature } from a fresh derive-challenge signed by the wallet.
 * TODO(WS-B/lead): wire the sign step. Planned:
 *   1. POST {AGENT_GATEWAY}/wallet/knowledge-graph/enable is derive-based; obtain challenge via KFDB
 *      derive-challenge, sign EIP-712 with the gate wallet key, POST { challenge_id, signature }.
 *   2. Assert 200 { enabled: true, deriveSessionActive: true }.
 */
async function enableIngestion() {
  if (!WALLET_TOKEN) {
    return { enabled: false, reason: 'RD_WALLET_TOKEN not set (needed for Authorization on /wallet/* )' };
  }
  // TODO(WS-B/lead): replace with the real derive-challenge → sign → enable flow.
  return { enabled: false, reason: 'enable flow not wired yet — needs derive-challenge signing (see TODO)' };
}

/**
 * Run a rickydata-code chat for a fresh claudeSessionId.
 * TODO(WS-B): the gateway must (a) inject rd-plugin as a tool overlay when
 * knowledgeGraphIngestion is true, and (b) set RICKYDATA_KG_SINK=gateway +
 * RD_SPOOL_DIR in rickydataCodeEnv (rickydata-code-chat-runner.ts:80). Until the
 * injection lands, this returns { ran: false }. Planned invocation: POST the
 * agent chat endpoint with executionEngine=rickydata-code and capture the
 * claudeSessionId echoed back by the run.
 */
async function runRickydataCodeChat(claudeSessionId) {
  return { ran: false, claudeSessionId, reason: 'gateway rd-plugin injection not built yet (WS-B)' };
}

export async function runRemoteProof() {
  const claudeSessionId = process.env.RD_REMOTE_SID || randomUUID();
  const enabled = await enableIngestion();
  const ran = enabled.enabled ? await runRickydataCodeChat(claudeSessionId) : { ran: false, reason: 'ingestion not enabled' };

  const query = `MATCH (s:ClaudeCodeSession {claude_session_id: $sid, wallet_address: $wallet})
                 RETURN s.node_id AS node_id, s.schema_version AS schema_version`;
  let rows = [];
  let queryError = null;
  if (ran.ran) {
    await new Promise((r) => setTimeout(r, 6000)); // allow spool ingest
    try {
      ({ data: rows } = await kql(query, { sid: claudeSessionId, wallet: GATE_WALLET }));
    } catch (err) {
      queryError = err.message;
    }
  }

  const schemaOk = rows.some((r) => Number(r.schema_version) === 3);
  const pass = enabled.enabled && ran.ran && rows.length >= 1 && schemaOk;
  return {
    step: 'remote-proof',
    pass,
    claudeSessionId,
    wallet: GATE_WALLET,
    agentGateway: AGENT_GATEWAY,
    query,
    result: { enabled, ran, rows, schemaOk, queryError },
    timestamp: new Date().toISOString(),
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runRemoteProof()
    .then((r) => { console.log(JSON.stringify(r, null, 2)); process.exit(r.pass ? 0 : 1); })
    .catch((err) => { console.error(err.message); process.exit(1); });
}
