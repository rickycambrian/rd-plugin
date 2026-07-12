# SPEC-005 — Codex fold-in (WS-F, post-gate)

**Status**: DONE — shipped `71fc889` + `ed364b9` + `60fce6a`, cutover applied 2026-07-12 (see Production Proof). Conforms to [SPEC-000](./SPEC-000-master.md).
**Scope**: `src/codex/` (new), `hooks/` (Codex event wiring), parity proof before cutover.

## Goal

Fold the existing standalone Codex hooks into rd-plugin so Codex sessions write the same schema-v3 graph, under the same wallet, sharing the same `HarnessSessionKey` (D6) as Claude Code sessions — one plugin, both harnesses. Cut over only after a parity proof shows the ported path matches the current standalone hooks byte-for-byte on graph output.

## Current state (file:line evidence)

- Standalone Codex hooks live outside this repo at `~/.codex/hooks/kfdb-codex-hook.mjs` and `~/.codex/hooks/kfdb-codex-flush.mjs` (two-stage: fast hook + flush — the same shape rd-plugin's Claude path uses). These currently write directly to KFDB.
- rd-plugin has no `src/codex/` yet.
- Shared infra already present after WS-A/WS-C: the S2D derive-session cache at `~/.rickydata/derive-session.json` (SPEC-000 §Filesystem — same file the codex hooks use, same keyHex for same wallet) and the SDK trace/session-link builders. The Codex port reuses these — no second crypto path.

## Exact changes (after gate)

1. **Port** `kfdb-codex-hook.mjs` → `src/codex/capture.mjs` and `kfdb-codex-flush.mjs` → `src/codex/flush.mjs`, rebased onto rd-plugin's shared libs (config loader, sink resolver, S2D, SDK trace builder). Preserve Codex's event field mapping into `ClaudeCodeHookEventRecord` shape (the trace type is harness-agnostic).
2. **Session linking**: Codex flush appends `buildSessionLinkOperations` with `fromLabel` = the Codex session label into the same `HarnessSessionKey` keyed on `(walletLower, sessionUuid)` (SPEC-003). A Codex session that shares a Claude session UUID converges on the same key.
3. **Sink parity**: Codex path honors `RICKYDATA_KG_SINK` (direct/gateway/off) identically — same spool format, same write contract.
4. **Wiring**: Codex event hooks point at `src/codex/*` dist entrypoints; the standalone `~/.codex/hooks/*` are removed only after the parity proof passes.

## Parity proof (cutover gate)

Before removing the standalone hooks: run an identical scripted Codex session through (a) the current standalone hooks and (b) the ported rd-plugin Codex path, both to the test wallet in separate session-id windows, and diff the resulting node/edge sets (normalizing timestamps + session IDs). Zero structural diff → cutover approved. Record the diff summary in Production Proof below.

## Verification plan

1. Unit: Codex event → trace mapping; sink resolution identical to Claude path.
2. Parity diff (above) — the hard gate.
3. Cross-harness: Codex + Claude sessions sharing a UUID show `SAME_SESSION` in-degree ≥2.

## Production Proof

**2026-07-12 — WS-F shipped, parity accepted, cutover applied.** Wallet `0xb3e6fa9620933ba9a6037f4ff890ec5fad0ba113`, KFDB `http://34.60.37.158`.

### Ruling that amended this spec (lead, Option A)

The original "byte-for-byte vs standalone hooks" parity gate was unsatisfiable: the SDK's mandated `buildCodexHookTraceOperations` emits the **CodexSession** family (sha1 UUIDv5, SDK namespace) while the legacy `~/.codex/hooks` scripts emit a structurally different **AgentChatSession** family (sha256, un-namespaced, different label/key tuple). Mirroring the claude-code precedent (legacy AgentChatSession superseded by the SDK ClaudeCodeSession family), the ruling: the new pipeline writes the SDK **CodexSession** family in BOTH sinks; legacy AgentChatSession nodes stand as a superseded family (left in place, no backfill); the legacy `/api/v1/plugin/*` stream is intentionally NOT written for codex (it would repopulate the superseded family server-side). Locked subs: agentId env `RD_CODEX_AGENT_ID` default `'codex'`; D6 `HarnessSessionKey` keyed on the codexSessionId with `fromLabel: 'CodexSession'`, `fromNodeId` extracted from the built CodexSession create_node op (unit-tested: exactly one per trace); owned-repo capture gate kept, config-overridable via `codex_repo_owners` (default `['rickycambrian']`).

### Redefined parity proof (all three passed)

| Artifact | Result | Evidence |
|---|---|---|
| (i) Determinism | **pass** | Unit test: two builds of the same trace input → byte-identical ops (SDK `updated_at` derives from `trace.completedAt`, not wall-clock) |
| (ii) direct == gateway | **pass** | Unit test: `writeCodexSpool` graphOperations concatenated across turn files deep-equals `buildCodexGraphOperations` (direct) — byte-identical by construction, same builder |
| (iii) Real production session | **pass** | codexSessionId `019f5769-a9f8-70b2-a1aa-01254dba5c73` (repo rickycambrian/rickydata_learn, 2 turns) → lead independently read the private layer: `CodexSession` `_id 4cc5991d-8417-590b-83c8-6b2e24378527` (agent_id `codex`, schema_version 3) + `HarnessSessionKey` `_id b610ab84-86a2-5f4c-aa39-454161027446` — both exactly matching the ids predicted before the write |

### Cutover + live E2E (lead)

`~/.codex/config.toml` hook commands repointed from `~/.codex/hooks/kfdb-codex-hook.mjs` → `rd-plugin/dist/codex-capture.mjs` (5 events; backup kept as `config.toml.bak-pre-rd-plugin-*`). Live `codex exec` session `019f5793-366c-7883-9fab-4086d620df6f` through the NEW hooks: capture appended to `~/.rickydata/state/rd-plugin/codex-pending/`, detached flush logged `codex flush direct complete … ops:23 graphOk:true`, and the graph shows `CodexSession` `_id 57494ebf-05cf-51c7-865c-688833e32bb7` (schema 3, agent_id `codex`) + `HarnessSessionKey` `_id 0756e493-e1a7-5955-ad95-d8904ed21d3b`. Offline queue empty after flush. Legacy scripts left in place (inert — nothing references them).

### Known soft edges

- **Codex hook trust pinning**: `[hooks.state]` in `config.toml` pins `trusted_hash` per hook command; after the cutover the first `codex exec` ran but captured nothing (new command not yet trusted — fail-open, session unharmed). Verified working with `--dangerously-bypass-hook-trust`; interactive codex will prompt once to trust the new command, after which hooks run normally.
- CodexSession carries `source` → private layer only: KQL and plaintext `/api/v1/entities/CodexSession` return empty by design; verify via the private-read path (`scripts/e2e/kg.mjs` helpers). `HarnessSessionKey` (no `source`) is KQL-visible but its inbound SAME_SESSION edge is on the private side.
- Gateway ingestion of codex spool files (`codex-trace-` prefix, deliberately distinct from the claude `trace-*` sweep) is a WS-B follow-up — artifact (ii) proves structural parity locally; remote TEE codex runs don't exist yet.

### Rode along in the same push

`ed364b9` — production field fix: graph-write client timeout centralized as `GRAPH_WRITE_TIMEOUT_MS = 60000` (was 20s writer / 15s drain; 900-op batches measured 10.7–19.5s server-side, causing fail-open queueing; drain must never replay at a shorter timeout than the writer). `60fce6a` — `--help`/`-h` early-exit guard on all six flag-taking entrypoints (backfill previously fell through to a real limit-100 run).
