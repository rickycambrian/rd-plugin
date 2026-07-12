#!/usr/bin/env node
/**
 * local-proof.mjs — SPEC-006 Step 1: local direct-sink proof.
 *
 * Drives a scripted Claude Code session through rd-plugin in direct-sink mode
 * for the gate wallet, then asserts schema-v3 ClaudeCodeSession nodes exist
 * under that wallet for the driven session id.
 *
 * Run by the lead only. Requires: local ~/.rickydata/config.json with the gate
 * wallet's private_key, and a built plugin dist (WS-A).
 *
 * Output: prints a JSON result and exits non-zero on failure. full-gate.mjs
 * imports runLocalProof() to aggregate.
 */

import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { kql } from './kql.mjs';

const GATE_WALLET = (process.env.RD_GATE_WALLET || '0xb3e6fa9620933ba9a6037f4ff890ec5fad0ba113').toLowerCase();
const PLUGIN_ROOT = process.env.CLAUDE_PLUGIN_ROOT || process.env.RD_PLUGIN_ROOT || join(homedir(), '.claude', 'plugins', 'rd-plugin');

/**
 * Drive one scripted session through the plugin dist entrypoints in direct mode.
 * TODO(WS-A): finalize once dist/{capture,flush}.mjs land. Planned invocation:
 *   1. For each hook event, pipe a hook JSON payload to:
 *        RICKYDATA_KG_SINK=direct node ${PLUGIN_ROOT}/dist/capture.mjs [--spawn-flush|--final]
 *      matching hooks/hooks.json (SessionStart, UserPromptSubmit, PostToolUse, Stop, SessionEnd).
 *   2. The SessionEnd `--final` flush performs the direct KFDB write.
 * Until dist exists, this returns { driven: false } and the assertion step is skipped-as-fail.
 */
function driveDirectSession(claudeSessionId) {
  const capture = join(PLUGIN_ROOT, 'dist', 'capture.mjs');
  if (!existsSync(capture)) {
    return { driven: false, reason: `plugin dist not found at ${capture} (WS-A not built yet)` };
  }
  const baseEvent = {
    claudeSessionId,
    cwd: process.cwd(),
    model: 'e2e-local-proof',
    transcriptPath: '',
  };
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
    // Fail-open contract: capture must always exit 0.
    if (res.status !== 0) {
      return { driven: false, reason: `capture exited ${res.status} for ${ev.hook_event_name}: ${res.stderr}` };
    }
  }
  return { driven: true };
}

export async function runLocalProof() {
  const claudeSessionId = process.env.RD_LOCAL_SID || randomUUID();
  const drive = driveDirectSession(claudeSessionId);

  const query = `MATCH (s:ClaudeCodeSession {claude_session_id: $sid, wallet_address: $wallet})
                 RETURN s.node_id AS node_id, s.schema_version AS schema_version`;
  let rows = [];
  let queryError = null;
  // Allow the detached flusher a moment to complete before asserting.
  if (drive.driven) await new Promise((r) => setTimeout(r, 4000));
  try {
    ({ data: rows } = await kql(query, { sid: claudeSessionId, wallet: GATE_WALLET }));
  } catch (err) {
    queryError = err.message;
  }

  const schemaOk = rows.some((r) => Number(r.schema_version) === 3);
  const pass = drive.driven && rows.length >= 1 && schemaOk;
  return {
    step: 'local-proof',
    pass,
    claudeSessionId,
    wallet: GATE_WALLET,
    query,
    result: { drivenSession: drive, rows, schemaOk, queryError },
    timestamp: new Date().toISOString(),
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runLocalProof()
    .then((r) => { console.log(JSON.stringify(r, null, 2)); process.exit(r.pass ? 0 : 1); })
    .catch((err) => { console.error(err.message); process.exit(1); });
}
