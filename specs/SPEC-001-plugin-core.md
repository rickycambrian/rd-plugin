# SPEC-001 — plugin core (WS-A)

**Status**: DRAFT — owner `plugin-core`. Conforms to [SPEC-000](./SPEC-000-master.md) frozen interface contract v1.
**Scope**: `src/`, `hooks/`, `dist/`, `package.json`, `tsconfig`, `scripts/build.mjs`, `scripts/verify-dist.mjs`, `tests/`. This spec is a contract-level description; the owning teammate holds the code.

## Goal

Two-stage session capture that never breaks a Claude Code session and writes identical graph data through either sink (`direct` local, `gateway` remote). Stage 1 is a fast synchronous appender invoked on every hook event; stage 2 is a detached flusher that transforms the appended buffer into a `ClaudeCodeHookTrace` and routes it to the resolved sink.

## Current state

Greenfield. Repo contains only the plugin manifest, marketplace descriptor, master spec, README, and LICENSE:
- `.claude-plugin/plugin.json:1` — name `rd-plugin`, version `0.1.0`, license AGPL-3.0.
- `.claude-plugin/marketplace.json:1` — marketplace `rickydata`, plugin `source: "./"`.
- No `src/`, `hooks/`, `dist/`, `tests/`, or build scripts exist yet.

Behavioral reference (reference-only, R1 — no verbatim copying): `knowledgeflow_plugin_kfdb/plugin/scripts/` (two-stage `session-start.js` / `session-end.js`, `track-*.js` appenders, `lib/sign-to-derive.js`, `lib/config.js`). The Cambrian scripts are single-stage per-event writers; rd-plugin instead buffers then flushes.

## Exact changes

### 1. Entrypoints (`dist/*.mjs`, built from `src/`)

Per SPEC-000 §"dist entrypoints": `capture.mjs`, `flush.mjs`, `session-start.mjs`, `setup.mjs`, `drain-queue.mjs`, `backfill.mjs`. All node ≥18, zero runtime deps, ESM, single-file (esbuild bundle).

- **`capture.mjs`** (stage 1, fast): reads the hook JSON from stdin, resolves config + sink, and — unless sink is `off` — appends a normalized event record to the per-session buffer. Flags:
  - `--spawn-flush`: after appending, spawn `flush.mjs` **detached** (`spawn(..., { detached: true, stdio: 'ignore' }).unref()`) so the hook returns immediately.
  - `--final`: mark the session complete (SessionEnd) so the flusher emits the final trace unit and clears the buffer.
- **`flush.mjs`** (stage 2, detached): loads the buffer, builds a `ClaudeCodeHookTrace` (SPEC-000 §"Spool format" body type), routes to sink:
  - `direct`: derive S2D session, POST to `{api_url}/api/v1/write` (ops from SDK `buildClaudeCodeHookTraceOperations` + `buildSessionLinkOperations`), ≤900 ops/batch, `skip_embedding: true`; also write legacy `/api/v1/plugin/*` stream. On network failure enqueue to `queue/rd-plugin/`.
  - `gateway`: write one spool file `${RD_SPOOL_DIR}/trace-<claudeSessionId>-<seq>.json` atomically (tmp + rename), body = trace + `"spoolVersion": 1`. No keys, no network.
  - Idempotency: record a flush fingerprint in `state/rd-plugin/state.json`; skip re-emitting an already-flushed unit.
- **`session-start.mjs`**: chained after `capture.mjs` on SessionStart; performs any one-time-per-session bookkeeping (workspace resolution, excluded-directory check, log line). Must remain fail-open.
- **`setup.mjs`**: the `/rd-setup` entrypoint — interactive/non-interactive config writer + S2D enrollment round-trip (see SPEC-004; invoked by `commands/rd-setup.md`).
- **`drain-queue.mjs`**: replays `queue/rd-plugin/` entries into the direct sink; idempotent by deterministic IDs.
- **`backfill.mjs`**: bounded historical import (see [SPEC-007](./SPEC-007-backfill.md)).

### 2. Sink resolution (`src/lib/`)

Implement SPEC-000 §"Sink resolution order" exactly:
`env RICKYDATA_KG_SINK` > config `sink` > auto (`direct` if config has `private_key`; `off` if no usable config **unless** `RICKYDATA_KG_SINK=gateway`, which needs no local config — the gateway is the authenticator). `excluded_directories` short-circuits capture to a no-op for matching `cwd`.

### 3. Config loader (`src/lib/config.js`)

READ `~/.rickydata/config.json` (SPEC-000 §Config): existing keys `api_url` (default `http://34.60.37.158`), `api_key`, `private_key`, `track_messages`, `track_files`, `track_git`, `log_level`; new optional keys `enabled` (default `true` when `private_key` present), `excluded_directories` (default `[]`), `sink` (default auto). `RICKYDATA_API_URL` overrides `api_url`. Never rename existing keys.

### 4. Transcript flush

On Stop/SessionEnd, parse the transcript at `transcriptPath` (from the hook payload) to enrich the trace (`initialPrompt`, `filesChanged`, per-turn `events`). Bounded read — cap transcript bytes to avoid a slow flush; fail-open if the file is missing or malformed.

### 5. Hook wiring (`hooks/hooks.json`)

Exactly the SPEC-000 §"Hook wiring" table. All commands invoke `node ${CLAUDE_PLUGIN_ROOT}/dist/*.mjs`. SessionStart chains `capture.mjs && session-start.mjs`.

### 6. Invariants

- Every entrypoint top-level is `try { ... } catch { } finally { process.exit(0) }` — fail-open (SPEC-000 Invariant 1).
- `dist/` checked in and byte-reproducible from `src/` via `scripts/build.mjs`; CI `scripts/verify-dist.mjs` rebuilds and diffs (SPEC-000 Invariant 3).
- Legacy stream + schema-v3 graph both written on the direct sink (SPEC-000 Invariant 4).
- Shared code nodes (`CodeFile`/`CodeCommand`/`CodeWorkspace`) OMIT `source` (SPEC-000 §"Graph write contract" gotcha) — enforced by the SDK builder (WS-C), not re-implemented here.

## Verification plan

1. `npm run build` produces `dist/*.mjs`; `node scripts/verify-dist.mjs` exits 0 on a clean tree.
2. `npx vitest run` — unit tests for sink resolution truth table, config defaults, buffer append/flush idempotency, fail-open (malformed stdin, missing transcript, network error all exit 0).
3. Local direct-sink smoke via `scripts/e2e/local-proof.mjs` (SPEC-006 step 1): a scripted session produces schema-v3 nodes under the test wallet.
4. Gateway-sink smoke: `RICKYDATA_KG_SINK=gateway RD_SPOOL_DIR=/tmp/rd-spool` run produces a valid `trace-*.json` with `spoolVersion: 1` and zero network calls (asserted by running with no `api_key`).

## Production Proof

> _No proof yet._
