# SPEC-005 — Codex fold-in (WS-F, post-gate)

**Status**: BLOCKED on final gate (SPEC-000 §"Final gate" / SPEC-006). Do not start cutover until the Claude Code path is green. Conforms to [SPEC-000](./SPEC-000-master.md).
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

> _No proof yet._
