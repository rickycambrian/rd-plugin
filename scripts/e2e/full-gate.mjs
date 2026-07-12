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
 * Fails (exit 1) if any step is not `pass`. Writes proof-<YYYY-MM-DD>.json into
 * the repo root for the lead to transcribe into SPEC-006 Production Proof.
 *
 * Fixed params (SPEC-000 Final gate):
 *   wallet 0xb3e6fa9620933ba9a6037f4ff890ec5fad0ba113, KFDB http://34.60.37.158
 */

import { writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { kql } from './kql.mjs';
import { runLocalProof } from './local-proof.mjs';
import { runRemoteProof } from './remote-proof.mjs';
import { runToggleProof } from './toggle-proof.mjs';

const GATE_WALLET = (process.env.RD_GATE_WALLET || '0xb3e6fa9620933ba9a6037f4ff890ec5fad0ba113').toLowerCase();
const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

/**
 * Step 3 — parity. Compare the property-key/label shape of the direct-sink and
 * gateway-sink session nodes for the two driven sessions (timestamps and session
 * ids excluded). Zero structural diff = pass.
 */
async function parityCheck(localSid, remoteSid) {
  const shapeQuery = `MATCH (s:ClaudeCodeSession {claude_session_id: $sid, wallet_address: $wallet})
                      RETURN keys(s) AS prop_keys, labels(s) AS labels`;
  try {
    const [{ data: a }, { data: b }] = await Promise.all([
      kql(shapeQuery, { sid: localSid, wallet: GATE_WALLET }),
      kql(shapeQuery, { sid: remoteSid, wallet: GATE_WALLET }),
    ]);
    if (a.length === 0 || b.length === 0) {
      return { step: 'parity', pass: false, reason: 'one or both sessions missing', a, b, timestamp: new Date().toISOString() };
    }
    const norm = (row) => ({
      labels: [...(row.labels || [])].sort(),
      // exclude volatile props from the shape comparison
      keys: [...(row.prop_keys || [])].filter((k) => !['started_at', 'completed_at', 'claude_session_id', 'node_id'].includes(k)).sort(),
    });
    const na = norm(a[0]);
    const nb = norm(b[0]);
    const pass = JSON.stringify(na) === JSON.stringify(nb);
    return { step: 'parity', pass, direct: na, gateway: nb, timestamp: new Date().toISOString() };
  } catch (err) {
    return { step: 'parity', pass: false, reason: err.message, timestamp: new Date().toISOString() };
  }
}

/**
 * Step 4 — SAME_SESSION in-degree >= 2 on the HarnessSessionKey merge node for a
 * session touched by multiple writers.
 */
async function sameSessionInDegree(sid) {
  const query = `MATCH (k:HarnessSessionKey {claude_session_id: $sid, wallet_address: $wallet})<-[:SAME_SESSION]-(src)
                 RETURN count(src) AS in_degree, collect(DISTINCT labels(src)) AS source_labels`;
  try {
    const { data } = await kql(query, { sid, wallet: GATE_WALLET });
    const inDegree = data.length ? Number(data[0].in_degree) : 0;
    const sourceLabels = data.length ? data[0].source_labels : [];
    return { step: 'same-session-in-degree', pass: inDegree >= 2, sid, inDegree, sourceLabels, query, timestamp: new Date().toISOString() };
  } catch (err) {
    return { step: 'same-session-in-degree', pass: false, sid, reason: err.message, query, timestamp: new Date().toISOString() };
  }
}

async function main() {
  console.error('[full-gate] step 1: local direct-sink proof');
  const local = await runLocalProof();

  console.error('[full-gate] step 2: remote gateway-sink proof');
  const remote = await runRemoteProof();

  console.error('[full-gate] step 3: parity');
  const parity = await parityCheck(local.claudeSessionId, remote.claudeSessionId);

  console.error('[full-gate] step 4: SAME_SESSION in-degree');
  // Prefer the local session (touched by direct + link writers); fall back to remote.
  const inDegree = await sameSessionInDegree(local.claudeSessionId);

  console.error('[full-gate] step 5: toggle-off zero-writes');
  const toggle = await runToggleProof();

  const steps = { local, remote, parity, inDegree, toggle };
  const allPass = Object.values(steps).every((s) => s.pass === true);

  const date = new Date().toISOString().slice(0, 10);
  const proof = {
    gate: 'rd-plugin full-gate',
    wallet: GATE_WALLET,
    kfdb: process.env.RICKYDATA_API_URL || 'http://34.60.37.158',
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
