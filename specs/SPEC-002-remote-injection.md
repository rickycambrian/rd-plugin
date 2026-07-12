# SPEC-002 — remote injection + gateway sink (WS-B)

**Status**: DRAFT — owner `gateway`. Conforms to [SPEC-000](./SPEC-000-master.md) frozen interface contract v1.
**Scope (gateway repo)**: `mcp_deployments_registry/mcp-agent-gateway/src/`. This spec describes changes in the gateway repo, cross-referenced here because rd-plugin's gateway sink is the write half of the same contract.

## Goal

Run rd-plugin inside the rickydata remote TEE stack so that a `rickydata-code` chat/agent run captures the same schema-v3 trace as a local session — but with the user's keys **never entering the sandbox**. rd-plugin runs in gateway sink mode (spool files only); a trusted gateway-side ingestor reads the spool and performs the wallet-scoped KFDB write using the derive session already cached server-side. Injection is gated on the wallet's `knowledgeGraphIngestion` setting and is toggleable.

## Current state (file:line evidence, gateway repo)

- **Tool-overlay injection mechanism exists**: `mcp-agent-gateway/src/runner/claude-agent-runner.ts:652-708` — `materializeToolOverlay()` clones a plugin repo by commit, content-address verifies HEAD against `plugin_artifact_hash`, and injects via `--plugin-dir <dir> --setting-sources project,local`. This is the faithful plugin injection path rd-plugin will reuse.
- **rickydata-code runner env**: `mcp-agent-gateway/src/chat/rickydata-code-chat-runner.ts:80` — `rickydataCodeEnv()` sets `HOME`, `XDG_*` to `workspaceDir`. This is where `RICKYDATA_KG_SINK=gateway` and `RD_SPOOL_DIR=<workspaceDir>/.rd-spool` must be injected. No KG-sink env is set today.
- **Wallet KG toggle exists**: `mcp-agent-gateway/src/routes/wallet-routes.ts:398-469` — `POST /wallet/knowledge-graph/{enable,disable,status}` derives an S2D session (via `/api/v1/auth/derive-key`), caches it (`setCachedKfdbDeriveSession`), and flips `unifiedLedger` setting `knowledgeGraphIngestion`. This is the authoritative on/off for remote capture.
- **Trace ingestor exists**: `mcp-agent-gateway/src/integrations/kfdb-knowledge-graph.ts:1428` — `ingestClaudeCodeHookTrace(trace: ClaudeCodeHookTrace)` reads the cached derive session for `trace.walletAddress` and writes via `/api/v1/write` + `/api/v1/plugin/*` with headers `X-Wallet-Address` / `X-Derive-Session-Id` / `X-Derive-Key` (`kfdb-knowledge-graph.ts:1659-1661`). It returns `false` (no-op) when `apiKey`, derive session, or events are missing — already fail-open.

## Exact changes (gateway repo, owned by `gateway`)

### 1. Inject rd-plugin as a tool overlay, gated

In the `rickydata-code` run path, when `unifiedLedger.getSettings(wallet).knowledgeGraphIngestion === true`:
- Materialize rd-plugin via the existing overlay mechanism (`materializeToolOverlay`, pinned commit + artifact hash — SPEC-000 Invariant 3 content-addressing).
- In `rickydataCodeEnv()` (`rickydata-code-chat-runner.ts:80`), set `RICKYDATA_KG_SINK=gateway` and `RD_SPOOL_DIR=path.join(workspaceDir, '.rd-spool')`.
- When the setting is `false` or absent → do **not** inject and do **not** set the env → rd-plugin's own auto-resolution yields `off` (no local config in the sandbox), a double guarantee of zero capture.

### 2. Spool ingestor

After the run (or on flush events), read `${RD_SPOOL_DIR}/trace-*.json`:
- Validate `spoolVersion === 1`; body is a `ClaudeCodeHookTrace`.
- Override/confirm `trace.walletAddress` = the run's authenticated wallet (never trust the sandbox to name the wallet).
- Call `ingestClaudeCodeHookTrace(trace)` (`kfdb-knowledge-graph.ts:1428`), which uses the server-side cached derive session (keys never in sandbox).
- Delete each spool file on successful ingest (SPEC-000 §"Spool format": reader deletes on success). Leave on failure for retry.

### 3. Toggle parity

`POST /wallet/knowledge-graph/enable` (`wallet-routes.ts:400`) already caches the derive session and sets `knowledgeGraphIngestion: true`. Confirm the run path reads this setting at injection time so enable/disable takes effect on the next run with no redeploy. `disable` clears the cached derive session (`wallet-routes.ts:452`) so even a stray spool file cannot be ingested (ingestor returns `false` with no derive session).

## Verification plan

1. `cd mcp-agent-gateway && npx vitest run` — ingestor unit tests (valid spool → ingest + delete; `spoolVersion` mismatch → skip; wallet override; disabled setting → no injection, no env).
2. `scripts/e2e/remote-proof.mjs` (SPEC-006 step 2): enable KG ingestion for the test wallet, run a `rickydata-code` chat, assert schema-v3 nodes appear under the wallet and the `claudeSessionId` matches.
3. `scripts/e2e/toggle-proof.mjs` (SPEC-006 step 5): disable → run → assert zero new writes for that session window.
4. Parity: `full-gate.mjs` compares direct-sink and gateway-sink node shapes for equivalent event streams.

## Production Proof

> _No proof yet._
