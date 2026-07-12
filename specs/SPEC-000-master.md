# SPEC-000 — rd-plugin master spec

**Status**: ACTIVE — program started 2026-07-12
**Plan of record**: `/Users/riccardoesclapon/.claude/plans/ok-i-am-making-dynamic-mochi.md` (local copy of the approved plan; this spec is the living index)

## Goal

One unified Claude Code plugin (`rd-plugin@rickydata`) that tracks all sessions for a wallet into the wallet-scoped KFDB knowledge graph — identical behavior locally (direct sink) and on the rickydata remote TEE stack (gateway sink), toggleable on both sides, publicly installable.

## Invariants

1. **Hooks never break a session.** Every entrypoint is try/catch + `exit 0`; fail-open always.
2. **Wallet-scoped writes only.** All KFDB graph writes carry S2D headers for the owning wallet; no plaintext private data.
3. **One commit = one behavior.** `dist/` is checked in and byte-reproducible from `src/` (CI `verify-dist`); a pinned commit hash fully determines executable bytes (TEE content-addressing).
4. **Legacy stream + schema-v3 graph both written** until a future deprecation spec says otherwise.
5. **No cambriannetwork.** KFDB = rickydata stack. CI gate: no `cambrian`/`knowledgeflow` branding in the shippable surface (README, docs/, commands/, skills/, .mcp.json, hooks/, src/, dist/), allowlisting the `rickycambrian` GitHub org handle. Specs and `scripts/migrate-settings.mjs` (which must name the legacy `cambriannetwork` keys to remove them) are out of gate scope. (Refined 2026-07-12 — the literal whole-repo grep was unsatisfiable: the org handle itself contains the substring.)

## Decision log

| # | Decision | Status |
|---|---|---|
| D1 | Plugin at repo root; `marketplace.json` coexists with `source:"./"` | **VALIDATED 2026-07-12** — `claude plugin marketplace add <path>` → marketplace `rickydata` registered; `claude plugin install rd-plugin@rickydata` → enabled, scope user. GitHub-form re-validation after first push (WS-E). |
| D2 | TypeScript src → checked-in esbuild single-file dist, zero runtime deps | locked |
| D3 | Two-stage capture (fast appender + detached flusher on Stop/SessionEnd) | locked |
| D4 | Sink switch `RICKYDATA_KG_SINK` ∈ direct / gateway / off | locked |
| D5 | rickydata identity; config stays `~/.rickydata/config.json` (zero migration) | locked |
| D6 | SAME_SESSION star topology via `HarnessSessionKey` merge node | locked |
| — | License AGPL-3.0; Cambrian-origin JS = behavioral reference only (R1) | locked |

## Frozen interface contract (v1 — teammates build against this; changes require lead sign-off)

### Identity
- Plugin name `rd-plugin`, marketplace `rickydata`, install string `rd-plugin@rickydata`.
- Commands: `/rd-setup`, `/rd-status`, `/rd-search`, `/rd-sessions`.

### Config — `~/.rickydata/config.json` (existing file; rd-plugin READS existing keys, may ADD new optional keys, never renames)
- Existing keys used as-is: `api_url` (KFDB base, default `http://34.60.37.158`), `api_key` (Bearer), `private_key` (wallet key for S2D; wallet address is DERIVED from it, lowercase in all graph props), `track_messages`, `track_files`, `track_git`, `log_level`.
- New optional keys (rd-plugin defaults if absent): `enabled` (bool, default `true` — a pure kill-switch; the real no-config gate is sink resolution, since defaulting on `private_key` presence would break gateway sink where no local key exists), `excluded_directories` (string[], default `[]`), `sink` (`"direct" | "gateway" | "off"`, default auto). (Amended 2026-07-12, lead-acked WS-A deviation.)
- Sink resolution order: env `RICKYDATA_KG_SINK` > config `sink` > auto (`direct` if config has `private_key`; `off` if no usable config **unless** `RICKYDATA_KG_SINK=gateway` is set, which requires no local config — the gateway is the authenticator).

### Env vars
- `RICKYDATA_KG_SINK` — `direct | gateway | off`.
- `RD_SPOOL_DIR` — gateway-sink spool directory (set by the gateway runner, e.g. `<workspaceDir>/.rd-spool`).
- `RICKYDATA_API_URL` — overrides `api_url`.

### Filesystem (all under `~/.rickydata/`, namespaced to avoid collisions with existing consumers)
- `derive-session.json` — shared S2D derive-session cache (same file the codex hooks use; same keyHex for same wallet).
- `state/rd-plugin/state.json` — flush fingerprints (idempotency) + backfill watermark.
- `queue/rd-plugin/` — offline retry queue.
- `logs/rd-plugin.log` — plugin log (respects `log_level`).

### dist entrypoints (checked in, node ≥18, zero deps)
`capture.mjs`, `flush.mjs`, `session-start.mjs`, `setup.mjs`, `drain-queue.mjs`, `backfill.mjs`.

### Hook wiring (`hooks/hooks.json`)
| Event | Command | Timeout |
|---|---|---|
| SessionStart | `node ${CLAUDE_PLUGIN_ROOT}/dist/capture.mjs && node ${CLAUDE_PLUGIN_ROOT}/dist/session-start.mjs` | 10s |
| UserPromptSubmit | `node ${CLAUDE_PLUGIN_ROOT}/dist/capture.mjs` | 5s |
| PostToolUse (`*`) | `node ${CLAUDE_PLUGIN_ROOT}/dist/capture.mjs` | 5s |
| Notification (`idle_prompt`) | `node ${CLAUDE_PLUGIN_ROOT}/dist/capture.mjs` | 5s |
| Stop | `node ${CLAUDE_PLUGIN_ROOT}/dist/capture.mjs --spawn-flush` | 10s |
| SessionEnd | `node ${CLAUDE_PLUGIN_ROOT}/dist/capture.mjs --spawn-flush --final` | 10s |

### Spool format (gateway sink)
- One JSON file per flush unit: `${RD_SPOOL_DIR}/trace-<claudeSessionId>-<seq>.json`.
- Body = exactly the `ClaudeCodeHookTrace` input type accepted by `buildClaudeCodeHookTraceOperations` in the `rickydata` npm SDK (`packages/core/src/kfdb/claude-code-hook-trace.ts`) — the same type `ingestClaudeCodeHookTrace` (mcp-agent-gateway) consumes. Plus top-level `"spoolVersion": 1`.
- Writer creates files atomically (write tmp + rename). Reader (gateway) deletes on successful ingest.

### Graph write contract (direct sink)
- `POST {api_url}/api/v1/write` with `Authorization: Bearer <api_key>` + S2D headers `X-Wallet-Address` / `X-Derive-Session-Id` / `X-Derive-Key`; ≤900 ops per batch; `skip_embedding: true`.
- Ops built by `rickydata` SDK `buildClaudeCodeHookTraceOperations` (`TRACE_SCHEMA_VERSION=3`, deterministic UUIDv5 ids) + `buildSessionLinkOperations` (D6).
- **Gotcha**: shared code nodes (`CodeFile`/`CodeCommand`/`CodeWorkspace`) OMIT `source` entirely (never explicit null).
- Legacy stream: also write existing `/api/v1/plugin/*` endpoints (session/messages/tool-calls/file-edits/git) with unchanged semantics.
- **Counter-regression rule** (verified 2026-07-12): the KFDB `session_end` handler overwrites `message_count`/`tool_call_count` UNCONDITIONALLY (session/plugin.rs:1017, no set-if-greater guard). rd-plugin flush must therefore never send a session_end whose counts are lower than what it previously sent for that session — compute counts from the full authoritative transcript (monotonic by construction) and skip the counter fields (or the whole session_end re-send) if a recount is ever lower than the fingerprinted previous send.

### SDK exports (WS-C, `rickydata` npm)
- `sessionLinkNodeId({ walletAddress, claudeSessionId })` — deterministic UUIDv5 for `HarnessSessionKey`.
- `buildSessionLinkOperations({ walletAddress, claudeSessionId, fromNodeId, fromLabel })` — merge-node `HarnessSessionKey { wallet_address, claude_session_id, schema_version }` + edge `(from)-[:SAME_SESSION]->(key)`.

## Workstream status

| WS | Owner | Status |
|---|---|---|
| C — SDK session-link helpers | `sdk-link` | **DONE** — rickydata_SDK main `177ac9d` + `237aa12` (sessionLinkNodeId, buildSessionLinkOperations, claudeCodeSessionNodeId, pass-through fields; 18 tests) |
| A — plugin core | `plugin-core` | **DONE + GATE-PROVEN** — repinned to published `rickydata@1.11.0` (`921a769`); spoolVersion 2 `graphOperations` parity (`312f4ba`); `initial_prompt` UserPromptSubmit fallback for transcript-less workspaces (`32da2c2`, the gate-pinned commit); 62 tests, dist byte-verified. |
| B — gateway sink + remote injection | `gateway` | **DONE + DEPLOYED** — merged to main and live in production TEE (`agent-gateway-blue`): tool-overlay injection gated on `knowledgeGraphIngestion`, CLI `run --plugin-dir` + `--session-id`→HookContext (rickydata_code `fa01bbe`, vendored `3b60d5f86`), spool v1+v2 sweep with validated `graphOperations` forwarding + duplicate-AgentChat-family skip (`94c7988e5`), `RD_PLUGIN_COMMIT=32da2c2…` repo variable. Gateway suite 6615 green. |
| D — home + rickygit linking | `home-bridge` | **DONE + GATE-PROVEN** — rickydata_home `752e81c` + walletAddress threading (`d4a3126`) + `FORCE_SESSION_IDS` targeted re-bridge (`2e3666e`); rickydata_git `3d588db`. Production in-degree 2 proven on session `a08f7c1e…`. |
| E — migration + public onboarding | `docs-onboarding` | **DONE** — E1 `8dce165` (specs, docs, e2e); E2 applied: rd-plugin installed as `rd-plugin@rickydata`, inline hooks migrated off `~/.claude/settings.json`. |
| F — Codex fold-in | (post-gate) | UNBLOCKED — gate passed 2026-07-12 |
| G — KFDB backend health | `kfdb-health` | DONE (parallel) |

## Final gate

`scripts/e2e/full-gate.mjs` — local direct-sink proof, remote gateway-sink proof, parity, SAME_SESSION in-degree ≥2, toggle-off zero-writes, emit `proof-<date>.json` → SPEC-006 Production Proof. Wallet: `0xb3e6fa9620933ba9a6037f4ff890ec5fad0ba113`. KFDB prod: `http://34.60.37.158`.

## Production Proof

**2026-07-12 — FULL GATE PASSED (5/5).** `proof-2026-07-12.json`, plugin commit `32da2c284c51c56d5fdadda826c58e8f9b405842`. Full step-by-step evidence (node ids, session ids, parity key sets) in [SPEC-006 Production Proof](SPEC-006-verification-gate.md#production-proof). Summary: local direct-sink node `b80e0807…` (session `a08f7c1e…`), remote TEE gateway-sink node `896c88ed…` (session `c5daf8b0…`), parity key-set identical, SAME_SESSION in-degree 2 on `12fb470f…`, toggle-off absence proven on session `153262ed…`.
