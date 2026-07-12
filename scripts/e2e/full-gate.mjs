#!/usr/bin/env node
/**
 * full-gate.mjs — SPEC-006 final verification gate (lead-only).
 *
 * Orchestrates the 6-step contract:
 *   1. local direct-sink proof      (local-proof.mjs)
 *   2. remote gateway-sink proof    (remote-proof.mjs)
 *   3. parity: direct vs gateway node/edge shapes
 *   4. SAME_SESSION in-degree >= 2 on the HarnessSessionKey merge node
 *   5. toggle-off zero-writes       (toggle-proof.mjs)
 *   6. emit proof-<date>.json
 *
 * All graph assertions read S2D-encrypted wallet-scoped nodes via the SDK
 * private-scope direct-read path (kg.mjs) — /api/v1/kql cannot see them.
 *
 * The lead supplies the three real session ids (from live `claude -p` /
 * rickydata-code / disabled runs) via flags or env:
 *   --local-session-id  <uuid>   (RD_LOCAL_SID)
 *   --remote-session-id <uuid>   (RD_REMOTE_SID)
 *   --toggle-session-id <uuid>   (RD_TOGGLE_SID)
 * A session touched by >=2 writer families (direct + home/git link) is used for
 * the in-degree check; defaults to the local session (override --indegree-session-id).
 *
 * Fails (exit 1) if any step is not `pass`. Writes proof-<YYYY-MM-DD>.json into
 * the repo root for the lead to transcribe into SPEC-006 Production Proof.
 *
 * Fixed params (SPEC-000 Final gate):
 *   wallet 0xb3e6fa9620933ba9a6037f4ff890ec5fad0ba113, KFDB http://34.60.37.158
 */

import { writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeClient, getKnown, claudeSessionNodeId, sameSessionInDegree, CLAUDE_CODE_SESSION_LABEL } from './kg.mjs';
import { runLocalProof } from './local-proof.mjs';
import { runRemoteProof } from './remote-proof.mjs';
import { runToggleProof } from './toggle-proof.mjs';

const GATE_WALLET = (process.env.RD_GATE_WALLET || '0xb3e6fa9620933ba9a6037f4ff890ec5fad0ba113').toLowerCase();
const AGENT_GATEWAY = (process.env.RD_AGENT_GATEWAY || 'https://agents.rickydata.org').replace(/\/+$/, '');
const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

/** Plugin commit hash bound into the proof (TEE content-addressing). Fail-soft to null. */
function resolvePluginCommit() {
  if (process.env.RD_PLUGIN_COMMIT) return process.env.RD_PLUGIN_COMMIT.trim();
  try {
    return execSync('git rev-parse HEAD', { cwd: REPO_ROOT, encoding: 'utf8' }).trim();
  } catch {
    return null;
  }
}

function parseArgs(argv) {
  const args = {
    localSessionId: process.env.RD_LOCAL_SID || null,
    remoteSessionId: process.env.RD_REMOTE_SID || null,
    toggleSessionId: process.env.RD_TOGGLE_SID || null,
    indegreeSessionId: process.env.RD_INDEGREE_SID || null,
    synthetic: false,
  };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--local-session-id') args.localSessionId = argv[++i];
    else if (argv[i] === '--remote-session-id') args.remoteSessionId = argv[++i];
    else if (argv[i] === '--toggle-session-id') args.toggleSessionId = argv[++i];
    else if (argv[i] === '--indegree-session-id') args.indegreeSessionId = argv[++i];
    else if (argv[i] === '--synthetic') args.synthetic = true;
    else if (argv[i] === '--help' || argv[i] === '-h') args.help = true;
  }
  return args;
}

/** Normalized property-key set of a fetched node, excluding volatile/identity keys. */
function normPropKeys(node) {
  if (!node) return null;
  const raw = node.properties && typeof node.properties === 'object' ? node.properties : node;
  const exclude = new Set(['started_at', 'completed_at', 'claude_session_id', 'node_id', 'id', 'label']);
  return Object.keys(raw).filter((k) => !exclude.has(k)).sort();
}

/**
 * Step 3 — parity. Compare the property-key shape of the direct-sink and
 * gateway-sink ClaudeCodeSession nodes (fetched by deterministic id via private
 * direct read). Zero structural diff = pass.
 */
async function parityCheck(localSid, remoteSid) {
  try {
    const { client, walletAddress } = await makeClient({ scope: 'private' });
    const localId = claudeSessionNodeId(walletAddress, localSid);
    const remoteId = claudeSessionNodeId(walletAddress, remoteSid);
    const { output } = await getKnown(client, [
      { label: CLAUDE_CODE_SESSION_LABEL, id: localId },
      { label: CLAUDE_CODE_SESSION_LABEL, id: remoteId },
    ]);
    const direct = normPropKeys(output[`${CLAUDE_CODE_SESSION_LABEL}:${localId}`]);
    const gateway = normPropKeys(output[`${CLAUDE_CODE_SESSION_LABEL}:${remoteId}`]);
    if (!direct || !gateway) {
      return { step: 'parity', pass: false, reason: 'one or both session nodes missing', direct, gateway, timestamp: new Date().toISOString() };
    }
    const pass = JSON.stringify(direct) === JSON.stringify(gateway);
    return { step: 'parity', pass, direct, gateway, timestamp: new Date().toISOString() };
  } catch (err) {
    return { step: 'parity', pass: false, reason: err.message, timestamp: new Date().toISOString() };
  }
}

/**
 * Step 4 — SAME_SESSION in-degree >= 2 on the HarnessSessionKey merge node for a
 * session touched by multiple writer families. Measured via kg.sameSessionInDegree
 * (distinct source session-node families present == SAME_SESSION in-degree, since
 * KFDB exposes no wallet-scoped edge read).
 */
async function inDegreeCheck(sid) {
  try {
    const { client, walletAddress } = await makeClient({ scope: 'private' });
    const res = await sameSessionInDegree(client, walletAddress, sid);
    return {
      step: 'same-session-in-degree',
      pass: res.harnessPresent && res.inDegree >= 2,
      sid,
      inDegree: res.inDegree,
      sourceLabels: res.sources,
      harnessPresent: res.harnessPresent,
      harnessId: res.harnessId,
      timestamp: new Date().toISOString(),
    };
  } catch (err) {
    return { step: 'same-session-in-degree', pass: false, sid, reason: err.message, timestamp: new Date().toISOString() };
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log('usage: node scripts/e2e/full-gate.mjs --local-session-id <uuid> --remote-session-id <uuid> --toggle-session-id <uuid> [--indegree-session-id <uuid>] [--synthetic]');
    process.exit(0);
  }

  console.error('[full-gate] step 1: local direct-sink proof');
  const local = await runLocalProof({ sessionId: args.localSessionId, synthetic: args.synthetic });

  console.error('[full-gate] step 2: remote gateway-sink proof');
  const remote = await runRemoteProof({ sessionId: args.remoteSessionId });

  console.error('[full-gate] step 3: parity');
  const parity = await parityCheck(local.claudeSessionId, remote.claudeSessionId);

  console.error('[full-gate] step 4: SAME_SESSION in-degree');
  const inDegreeSid = args.indegreeSessionId || local.claudeSessionId;
  const inDegree = await inDegreeCheck(inDegreeSid);

  console.error('[full-gate] step 5: toggle-off zero-writes');
  const toggle = await runToggleProof({ sessionId: args.toggleSessionId });

  const steps = { local, remote, parity, inDegree, toggle };
  const allPass = Object.values(steps).every((s) => s.pass === true);

  const date = new Date().toISOString().slice(0, 10);
  const proof = {
    gate: 'rd-plugin full-gate',
    wallet: GATE_WALLET,
    kfdb: process.env.RICKYDATA_API_URL || 'http://34.60.37.158',
    agentGateway: AGENT_GATEWAY,
    pluginCommit: resolvePluginCommit(),
    all_pass: allPass,
    steps,
    generatedAt: new Date().toISOString(),
  };
  const outPath = join(REPO_ROOT, `proof-${date}.json`);
  writeFileSync(outPath, JSON.stringify(proof, null, 2) + '\n');

  console.error(`[full-gate] wrote ${outPath}`);
  console.log(JSON.stringify({ all_pass: allPass, steps: Object.fromEntries(Object.entries(steps).map(([k, v]) => [k, v.pass])) }, null, 2));
  process.exit(allPass ? 0 : 1);
}

main().catch((err) => { console.error(err.stack || err.message); process.exit(1); });
