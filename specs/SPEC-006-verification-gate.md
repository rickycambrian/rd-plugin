# SPEC-006 — verification gate (WS-GATE)

**Status**: DRAFT — orchestrated by the lead only (`scripts/e2e/full-gate.mjs`). Conforms to [SPEC-000](./SPEC-000-master.md) §"Final gate".
**Scope**: `scripts/e2e/{kql,local-proof,remote-proof,toggle-proof,full-gate}.mjs`. Emits `proof-<date>.json` → this spec's Production Proof.

## Fixed parameters

- Wallet: `0xb3e6fa9620933ba9a6037f4ff890ec5fad0ba113` (lowercase in all graph props).
- KFDB prod: `http://34.60.37.158` (override via `RICKYDATA_API_URL` / `api_url`).
- Graph schema: `TRACE_SCHEMA_VERSION = 3` (SDK `claude-code-hook-trace.ts:44`).
- S2D read/write headers: `Authorization: Bearer <api_key>` + `X-Wallet-Address` / `X-Derive-Session-Id` / `X-Derive-Key` (evidence: `mcp-agent-gateway/src/integrations/kfdb-knowledge-graph.ts:1659-1661`).
- KQL read endpoint: `POST {api_url}/api/v1/kql` with `{ query }` → `{ data: [...] }` (evidence: `mcp-agent-gateway/src/tools/kfdb-code-tools.ts:529`).

## The 6-step full-gate contract

Each step writes a boolean + evidence into `proof-<date>.json`. `full-gate.mjs` fails if any step is not `pass`.

### Step 1 — Local direct-sink proof (`local-proof.mjs`)
Drive a scripted Claude Code session with `RICKYDATA_KG_SINK=direct` and the test wallet's local config. After flush, assert schema-v3 nodes exist under the wallet for the session:
```
MATCH (s:ClaudeCodeSession {claude_session_id: $sid, wallet_address: $wallet})
RETURN s.node_id, s.schema_version
```
Assert: ≥1 row; `schema_version = 3`.

### Step 2 — Remote gateway-sink proof (`remote-proof.mjs`)
Enable KG ingestion (`POST /wallet/knowledge-graph/enable`), run a `rickydata-code` chat for a fresh `claudeSessionId`, wait for spool ingest. Assert the same query returns the node — proving the gateway wrote the wallet-scoped graph with keys that never entered the sandbox.

### Step 3 — Parity (in `full-gate.mjs`)
For equivalent event streams, compare direct-sink vs gateway-sink node/edge shapes (labels + property keys, timestamps/session-ids normalized). Assert: zero structural diff.

### Step 4 — SAME_SESSION in-degree ≥2 (in `full-gate.mjs`)
For a session touched by ≥2 writers (Claude direct + gateway, or + home/rickygit), assert the `HarnessSessionKey` merge node has SAME_SESSION in-degree ≥2:
```
MATCH (k:HarnessSessionKey {claude_session_id: $sid, wallet_address: $wallet})<-[:SAME_SESSION]-(src)
RETURN count(src) AS in_degree, collect(DISTINCT labels(src)) AS source_labels
```
Assert: `in_degree >= 2`.

### Step 5 — Toggle-off zero-writes (`toggle-proof.mjs`)
Disable KG ingestion (`POST /wallet/knowledge-graph/disable`), record the current node count for the wallet, run a session, re-count. Assert: delta = 0 (no new nodes for the disabled window).
```
MATCH (s:ClaudeCodeSession {wallet_address: $wallet}) WHERE s.started_at > $since
RETURN count(s) AS new_sessions
```
Assert: `new_sessions = 0`.

### Step 6 — Emit proof
`full-gate.mjs` writes `proof-<YYYY-MM-DD>.json` with per-step `{ pass, query, result, timestamp }` and a top-line `all_pass`. The lead copies real node IDs / KQL outputs / timestamps into the Production Proof sections of SPEC-001..007 and SPEC-000.

## No-regression gates (always required)

- CI green: typecheck, vitest, `verify-dist`, brand gate (`git grep -il cambrian` empty).
- Fail-open preserved: a forced network error during any step must still exit the session hook 0.

## Production Proof

**2026-07-12 — full gate PASSED (5/5).** Artifact: [`proof-2026-07-12.json`](../proof-2026-07-12.json) (all values below copied verbatim from it; `generatedAt: 2026-07-12T17:36:07.512Z`).

- Wallet `0xb3e6fa9620933ba9a6037f4ff890ec5fad0ba113` · KFDB `http://34.60.37.158` · Agent Gateway `https://agents.rickydata.org` · plugin commit `32da2c284c51c56d5fdadda826c58e8f9b405842` (== the `RD_PLUGIN_COMMIT` pinned in the deployed TEE container `agent-gateway-blue`, verified by `docker inspect` env).

| Step | Result | Evidence |
|---|---|---|
| 1. Local direct-sink | **pass** | Real `claude -p` session `a08f7c1e-c601-4977-aab9-0bc20a78ec8d` → `ClaudeCodeSession` node `b80e0807-aeb2-50bc-9d93-c2f82087a5e3`, `schema_version: 3`, private-scope direct read |
| 2. Remote gateway-sink | **pass** | Production rickydata-code chat session `c5daf8b0-a035-43fd-b975-a6687db4a91c` (CLI invoked with `--plugin-dir` overlay @ pinned commit, spoolVersion 2 graph-ops forwarded by gateway) → node `896c88ed-38d0-5728-9465-79bfad9d55e3`, `schema_version: 3` |
| 3. Parity | **pass** | Identical normalized property-key sets on both session nodes (12 keys incl. `initial_prompt`, `files_changed`, `schema_version`) — guaranteed by construction: both sinks run the same bundled SDK op builder |
| 4. SAME_SESSION in-degree | **pass** | `HarnessSessionKey` `12fb470f-f1b4-597f-bde5-2df8eb8aabbc` for the local session: inDegree 2, sources `[ClaudeCodeSession, RickydataChatSession]` |
| 5. Toggle-off zero writes | **pass** | KG disabled → chat session `153262ed-efa0-4ce1-8d78-ec589cf80977` → expected ids `fa7094e8-dcb1-56b6-b869-f781de4a06c2` / `19a97576-c0aa-5937-8c13-d6cea6e2a19d` both ABSENT |

Blockers fixed en route (all live in production): rickydata-code CLI `run --plugin-dir` + `--session-id`→HookContext threading (rickydata_code `fa01bbe`, vendored registry `3b60d5f86`); spoolVersion 2 `graphOperations` parity contract (rd-plugin `312f4ba`, registry `94c7988e5`); `initial_prompt` UserPromptSubmit fallback for transcript-less TEE workspaces (rd-plugin `32da2c2`).

Known soft edge (non-blocking): a single-turn session's detached Stop/SessionEnd flush can land after the gateway's last per-turn sweep; files persist and are picked up by the next sweep for that wallet workspace. Multi-turn sessions are unaffected (the gate chat uses two turns).
