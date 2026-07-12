#!/usr/bin/env node
/**
 * toggle-proof.mjs — SPEC-006 Step 5: toggle-off zero-writes proof.
 *
 * With wallet-scoped KG ingestion DISABLED, a rickydata-code chat must capture
 * nothing. This asserts the deterministic node ids for the disabled session are
 * ABSENT under the gate wallet.
 *
 * Because the node ids are deterministic from (wallet, agentId, sid) and
 * (wallet, sid), we can assert absence precisely without enumerating the graph:
 * fetch the expected ClaudeCodeSession and HarnessSessionKey ids via
 * batchGetEntities({scope:'private'}) and require both to be missing. This is far
 * stronger than a KQL count delta (which cannot even see encrypted nodes).
 *
 * Usage (lead disables ingestion, runs a chat that should NOT capture, passes id):
 *   node scripts/e2e/toggle-proof.mjs --session-id <claude-session-uuid>
 *
 * The disable step is a signed gateway call the lead performs live; optionally
 * this script will POST /wallet/knowledge-graph/disable if RD_WALLET_TOKEN is set.
 *
 * full-gate.mjs imports runToggleProof().
 */

import {
  makeClient, getKnown, claudeSessionNodeId, harnessKeyNodeId,
  CLAUDE_CODE_SESSION_LABEL, HARNESS_SESSION_KEY_LABEL,
} from './kg.mjs';

const GATE_WALLET = (process.env.RD_GATE_WALLET || '0xb3e6fa9620933ba9a6037f4ff890ec5fad0ba113').toLowerCase();
const AGENT_GATEWAY = (process.env.RD_AGENT_GATEWAY || 'https://agents.rickydata.org').replace(/\/+$/, '');
const WALLET_TOKEN = process.env.RD_WALLET_TOKEN || '';

function parseArgs(argv) {
  const args = { sessionId: process.env.RD_TOGGLE_SID || null };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--session-id') args.sessionId = argv[++i];
    else if (argv[i] === '--help' || argv[i] === '-h') args.help = true;
  }
  return args;
}

/**
 * Best-effort disable of KG ingestion for the gate wallet.
 * Evidence: mcp-agent-gateway/src/routes/wallet-routes.ts POST
 * /wallet/knowledge-graph/disable clears the cached derive session and sets
 * knowledgeGraphIngestion=false. Only attempted if a wallet token is provided;
 * otherwise the lead disables it out-of-band and this reports skipped.
 */
async function disableIngestion() {
  if (!WALLET_TOKEN) {
    return { attempted: false, reason: 'RD_WALLET_TOKEN not set; lead disables ingestion out-of-band' };
  }
  try {
    const res = await fetch(`${AGENT_GATEWAY}/wallet/knowledge-graph/disable`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${WALLET_TOKEN}`, 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(15_000),
    });
    const body = await res.json().catch(() => ({}));
    return { attempted: true, disabled: res.ok && body.enabled === false, status: res.status, body };
  } catch (err) {
    return { attempted: true, disabled: false, reason: err.message };
  }
}

export async function runToggleProof(opts = {}) {
  const claudeSessionId = opts.sessionId || null;
  if (!claudeSessionId) {
    return {
      step: 'toggle-proof',
      pass: false,
      reason: 'no --session-id given; disable ingestion, run a chat that must NOT capture, and pass its id',
      wallet: GATE_WALLET,
      timestamp: new Date().toISOString(),
    };
  }

  const disable = await disableIngestion();

  let absent = null;
  let readError = null;
  let ccId = null;
  let harnessId = null;
  let present = null;
  try {
    const { client, walletAddress } = await makeClient({ scope: 'private' });
    ccId = claudeSessionNodeId(walletAddress, claudeSessionId);
    harnessId = harnessKeyNodeId(walletAddress, claudeSessionId);
    const { output } = await getKnown(client, [
      { label: CLAUDE_CODE_SESSION_LABEL, id: ccId },
      { label: HARNESS_SESSION_KEY_LABEL, id: harnessId },
    ]);
    const ccPresent = !!output[`${CLAUDE_CODE_SESSION_LABEL}:${ccId}`];
    const harnessPresent = !!output[`${HARNESS_SESSION_KEY_LABEL}:${harnessId}`];
    present = { claudeCodeSession: ccPresent, harnessSessionKey: harnessPresent };
    absent = !ccPresent && !harnessPresent;
  } catch (err) {
    readError = err.message;
  }

  // Pass requires: both expected nodes ABSENT (no capture happened while disabled).
  const pass = absent === true;
  return {
    step: 'toggle-proof',
    pass,
    claudeSessionId,
    wallet: GATE_WALLET,
    expectedNodeIds: { claudeCodeSession: ccId, harnessSessionKey: harnessId },
    result: { disable, present, absent, readError },
    timestamp: new Date().toISOString(),
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log('usage: node scripts/e2e/toggle-proof.mjs --session-id <uuid>');
    process.exit(0);
  }
  runToggleProof(args)
    .then((r) => { console.log(JSON.stringify(r, null, 2)); process.exit(r.pass ? 0 : 1); })
    .catch((err) => { console.error(err.message); process.exit(1); });
}
