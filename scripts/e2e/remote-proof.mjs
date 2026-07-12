#!/usr/bin/env node
/**
 * remote-proof.mjs — SPEC-006 Step 2: remote gateway-sink proof.
 *
 * Asserts that a rickydata-code chat run on the remote TEE stack (rd-plugin in
 * gateway-sink mode) produced a schema-v3 ClaudeCodeSession node under the gate
 * wallet — proving the gateway performed the wallet-scoped write with keys that
 * never entered the sandbox.
 *
 * Like local-proof, the trace nodes are S2D-encrypted, so the assertion reads
 * them directly via the SDK private-scope path (kg.mjs), NOT via KQL.
 *
 * Usage (lead enables ingestion + runs the remote chat, then passes its id):
 *   node scripts/e2e/remote-proof.mjs --session-id <claude-session-uuid>
 *
 * The enable + run steps require signed gateway calls the lead performs live;
 * this script's job is the assertion. If no session id is supplied it reports
 * why (not-wired) rather than fabricating a pass.
 *
 * full-gate.mjs imports runRemoteProof().
 */

import { makeClient, getKnown, claudeSessionNodeId, prop, CLAUDE_CODE_SESSION_LABEL } from './kg.mjs';

const GATE_WALLET = (process.env.RD_GATE_WALLET || '0xb3e6fa9620933ba9a6037f4ff890ec5fad0ba113').toLowerCase();
const AGENT_GATEWAY = (process.env.RD_AGENT_GATEWAY || 'https://agents.rickydata.org').replace(/\/+$/, '');

function parseArgs(argv) {
  const args = { sessionId: process.env.RD_REMOTE_SID || null };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--session-id') args.sessionId = argv[++i];
    else if (argv[i] === '--help' || argv[i] === '-h') args.help = true;
  }
  return args;
}

export async function runRemoteProof(opts = {}) {
  const claudeSessionId = opts.sessionId || null;
  if (!claudeSessionId) {
    return {
      step: 'remote-proof',
      pass: false,
      reason: 'no --session-id given; enable gateway ingestion, run a rickydata-code chat, and pass its claude session id',
      wallet: GATE_WALLET,
      agentGateway: AGENT_GATEWAY,
      timestamp: new Date().toISOString(),
    };
  }

  let node = null;
  let readError = null;
  let nodeId = null;
  try {
    const { client, walletAddress } = await makeClient({ scope: 'private' });
    nodeId = claudeSessionNodeId(walletAddress, claudeSessionId);
    const { output } = await getKnown(client, [{ label: CLAUDE_CODE_SESSION_LABEL, id: nodeId }]);
    node = output[`${CLAUDE_CODE_SESSION_LABEL}:${nodeId}`];
  } catch (err) {
    readError = err.message;
  }

  const schemaVersion = node ? Number(prop(node, 'schema_version')) : null;
  const schemaOk = schemaVersion === 3;
  const pass = !!node && schemaOk;
  return {
    step: 'remote-proof',
    pass,
    claudeSessionId,
    wallet: GATE_WALLET,
    agentGateway: AGENT_GATEWAY,
    nodeId,
    result: { nodePresent: !!node, schemaVersion, schemaOk, readError },
    timestamp: new Date().toISOString(),
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log('usage: node scripts/e2e/remote-proof.mjs --session-id <uuid>');
    process.exit(0);
  }
  runRemoteProof(args)
    .then((r) => { console.log(JSON.stringify(r, null, 2)); process.exit(r.pass ? 0 : 1); })
    .catch((err) => { console.error(err.message); process.exit(1); });
}
