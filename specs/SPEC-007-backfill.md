# SPEC-007 — bounded backfill (WS-A)

**Status**: DRAFT — owner `plugin-core` (`dist/backfill.mjs`). Conforms to [SPEC-000](./SPEC-000-master.md).
**Scope**: `dist/backfill.mjs` (+ `src/` source), `state/rd-plugin/state.json` watermark.

## Goal

Import a user's existing local Claude Code transcript history into the wallet-scoped graph without hammering KFDB and without creating duplicates — a one-time (resumable) catch-up so the graph is not empty on day one. Idempotent: re-running never double-writes.

## Current state

- No backfill entrypoint exists. SPEC-000 §"dist entrypoints" lists `backfill.mjs` as a required checked-in entrypoint.
- Watermark file location is reserved: `~/.rickydata/state/rd-plugin/state.json` (SPEC-000 §Filesystem — "flush fingerprints (idempotency) + backfill watermark").
- Transcripts live under Claude Code's project history (discoverable from the same `transcriptPath` shape the hooks receive); the direct-sink write contract (SPEC-000 §"Graph write contract") is reused unchanged.

## Exact changes

### 1. CLI

`node dist/backfill.mjs [--since <ISO|Nd>] [--limit <N>] [--dry-run]`
- `--since` — only transcripts modified/started at/after this instant (ISO-8601 or `Nd` shorthand, e.g. `30d`). Default: the resume watermark, else 30d.
- `--limit` — max transcripts (sessions) to process this run. Default a safe cap (e.g. 200); enables incremental catch-up over multiple runs.
- `--dry-run` — enumerate + report counts; write nothing.

### 2. Resumable watermark

`state/rd-plugin/state.json` holds `{ backfill: { watermark: <ISO>, processedSessionIds: [...] } }`. Each processed session advances the watermark to its `startedAt` and records its id. A subsequent run starts from the watermark and skips `processedSessionIds`.

### 3. Rate limiting

Serial writes with a small inter-batch delay (KFDB is rate-limited ~1 req/s per wallet tier — see MEMORY: "add sleep(2000) between API calls"). Batches ≤900 ops, `skip_embedding: true`. Backoff on 429/5xx; on repeated failure, stop and leave the watermark unadvanced so the next run resumes cleanly.

### 4. Idempotency by deterministic IDs

All node/edge IDs come from the SDK's deterministic UUIDv5 builders (`buildClaudeCodeHookTraceOperations`, `buildSessionLinkOperations`). A re-import of the same session produces identical IDs → KFDB merge is a no-op. `processedSessionIds` is a fast-path skip; deterministic IDs are the correctness guarantee even if the watermark is lost.

### 5. Fail-open + sink respect

Honors `RICKYDATA_KG_SINK`: `off` → refuse (print a hint to enable a sink); `gateway` → out of scope (backfill is a local operation; print a hint); `direct` → run. Any per-session error is logged and skipped, never aborts the whole run.

## Verification plan

1. Unit: `--since` parsing (ISO + `Nd`); watermark advance/resume; `--dry-run` writes nothing; deterministic-ID skip.
2. Idempotency: run twice over the same window → second run reports 0 new nodes (KQL node count stable).
3. Rate-limit: assert inter-write delay ≥ configured floor; 429 triggers backoff.

## Production Proof

> _No proof yet._
