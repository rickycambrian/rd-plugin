#!/usr/bin/env node
/**
 * local-proof.mjs — SPEC-006 Step 1: local direct-sink proof.
 *
 * Asserts that a real Claude Code session, captured by rd-plugin in direct-sink
 * mode, produced a schema-v3 ClaudeCodeSession node under the gate wallet.
 *
 * Wallet-scoped trace nodes are S2D-encrypted and INVISIBLE to /api/v1/kql, so
 * this reads them directly via the rickydata SDK private-scope path (kg.mjs):
 * the ClaudeCodeSession node id is deterministic from (wallet, agentId, sid), so
 * we fetch it by id with batchGetEntities({scope:'private'}) — no query needed.
 *
 * Usage (lead runs a real `claude -p` session, then passes its id):
 *   node scripts/e2e/local-proof.mjs --session-id <claude-session-uuid>
 *
 * Fallback (no real session available) — drive the plugin dist synthetically:
 *   node scripts/e2e/local-proof.mjs --synthetic
 *
 * Requires: ~/.rickydata/config.json for the gate wallet with a usable
 * derive-session.json (written by a prior real session or /rd-setup), and
 * rickydata@1.11.0 at the repo root. Run from the repo root.
 *
 * full-gate.mjs imports runLocalProof() to aggregate.
 */

import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { makeClient, getKnown, claudeSessionNodeId, prop, CLAUDE_CODE_SESSION_LABEL } from './kg.mjs';

const GATE_WALLET = (process.env.RD_GATE_WALLET || '0xb3e6fa9620933ba9a6037f4ff890ec5fad0ba113').toLowerCase();
const PLUGIN_ROOT = process.env.CLAUDE_PLUGIN_ROOT || process.env.RD_PLUGIN_ROOT || join(homedir(), '.claude', 'plugins', 'rd-plugin');

function parseArgs(argv) {
  const args = { sessionId: process.env.RD_LOCAL_SID || null, synthetic: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--session-id') args.sessionId = argv[++i];
    else if (argv[i] === '--synthetic') args.synthetic = true;
    else if (argv[i] === '--help' || argv[i] === '-h') args.help = true;
  }
  return args;
}

/**
 * Fallback only: drive one scripted session through the plugin dist entrypoints
 * in direct mode, matching hooks/hooks.json. Used when no real session id is
 * supplied (--synthetic). The preferred path is a real `claude -p` session.
 */
function driveDirectSession(claudeSessionId) {
  const capture = join(PLUGIN_ROOT, 'dist', 'capture.mjs');
  if (!existsSync(capture)) {
    return { driven: false, reason: `plugin dist not found at ${capture} (WS-A not installed here)` };
  }
  const baseEvent = { claudeSessionId, cwd: process.cwd(), model: 'e2e-local-proof', transcriptPath: '' };
  const events = [
    { hook_event_name: 'SessionStart', flags: [] },
    { hook_event_name: 'UserPromptSubmit', flags: [], prompt: 'rd-plugin local-proof scripted prompt' },
    { hook_event_name: 'PostToolUse', flags: [], tool_name: 'Bash', tool_input: { command: 'echo hi' } },
    { hook_event_name: 'Stop', flags: ['--spawn-flush'] },
    { hook_event_name: 'SessionEnd', flags: ['--spawn-flush', '--final'] },
  ];
  for (const ev of events) {
    const payload = JSON.stringify({ ...baseEvent, ...ev });
    const res = spawnSync('node', [capture, ...ev.flags], {
      input: payload,
      env: { ...process.env, RICKYDATA_KG_SINK: 'direct' },
      encoding: 'utf8',
      timeout: 20_000,
    });
    if (res.status !== 0) {
      return { driven: false, reason: `capture exited ${res.status} for ${ev.hook_event_name}: ${res.stderr}` };
    }
  }
  return { driven: true };
}

export async function runLocalProof(opts = {}) {
  const synthetic = opts.synthetic ?? false;
  let claudeSessionId = opts.sessionId || null;

  // Fallback: synthetically drive a session and assert on the generated id.
  let drive = { driven: true, mode: 'assert-only (real session)' };
  if (!claudeSessionId) {
    if (!synthetic) {
      return {
        step: 'local-proof',
        pass: false,
        reason: 'no --session-id given and --synthetic not set; run a real `claude -p` session and pass its id',
        wallet: GATE_WALLET,
        timestamp: new Date().toISOString(),
      };
    }
    claudeSessionId = randomUUID();
    drive = { ...driveDirectSession(claudeSessionId), mode: 'synthetic' };
    if (drive.driven) await new Promise((r) => setTimeout(r, 4000)); // let the detached flusher finish
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
  const pass = (drive.driven !== false) && !!node && schemaOk;
  return {
    step: 'local-proof',
    pass,
    claudeSessionId,
    wallet: GATE_WALLET,
    nodeId,
    result: { drivenSession: drive, nodePresent: !!node, schemaVersion, schemaOk, readError },
    timestamp: new Date().toISOString(),
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log('usage: node scripts/e2e/local-proof.mjs --session-id <uuid> | --synthetic');
    process.exit(0);
  }
  runLocalProof(args)
    .then((r) => { console.log(JSON.stringify(r, null, 2)); process.exit(r.pass ? 0 : 1); })
    .catch((err) => { console.error(err.message); process.exit(1); });
}
