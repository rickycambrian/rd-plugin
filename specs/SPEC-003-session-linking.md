# SPEC-003 — session linking (D6 star topology) (WS-C consumer)

**Status**: DRAFT — SDK helpers owned by `sdk-link`; plugin/gateway callers consume them. Conforms to [SPEC-000](./SPEC-000-master.md) §"SDK exports" + Decision D6.
**Scope**: `rickydata` npm SDK (`rickydata_SDK/packages/core/src/kfdb/session-link.ts`) + all writer call sites (rd-plugin direct sink, gateway ingestor, home bridge, rickygit bridge).

## Goal

Every harness that touches the same Claude Code session converges on **one** merge node so a single query returns the full cross-harness view of that session. D6 uses a star topology: a deterministic `HarnessSessionKey` node keyed on `(walletLower, claudeSessionUuid)`, with a `SAME_SESSION` edge from each writer's own session node into the key. Because the key ID is deterministic (UUIDv5), independent writers converge without coordination.

## Current state (file:line evidence)

- **SDK helper in progress**: `rickydata_SDK/packages/core/src/kfdb/session-link.ts:27` defines `HARNESS_SESSION_KEY_LABEL = 'HarnessSessionKey'` and `session-link.ts:28` `SAME_SESSION_EDGE_TYPE = 'SAME_SESSION'`; `session-link.ts:68` `sessionLinkNodeId({ walletAddress, claudeSessionId })`; `session-link.ts:75` `buildSessionLinkOperations(...)` builds the merge node + `SAME_SESSION` edge. (WS-C — `sdk-link` owns final shape.)
- **Trace builder**: `rickydata_SDK/packages/core/src/kfdb/claude-code-hook-trace.ts:25` `ClaudeCodeHookTrace` and `claude-code-hook-trace.ts:44` `TRACE_SCHEMA_VERSION = 3`; deterministic UUIDv5 ids via `deterministicId` (`claude-code-hook-trace.ts:61`).
- **Existing session node writers** (edge sources):
  - `ClaudeCodeSession` — from rd-plugin (both sinks) and the gateway ingestor `ingestClaudeCodeHookTrace` (`mcp-agent-gateway/src/integrations/kfdb-knowledge-graph.ts:1428`).
  - `RickydataChatSession` (rickydata_home path) and `RickydataAgentSession` (rickydata_git path) — WS-D (`home-bridge`) writers.

## Exact changes

### 1. SDK exports (WS-C, `sdk-link`)

Per SPEC-000 §"SDK exports":
- `sessionLinkNodeId({ walletAddress, claudeSessionId })` → deterministic UUIDv5 for `HarnessSessionKey`. `walletAddress` lowercased before hashing (SPEC-000 §Config: wallet lowercase in all graph props).
- `buildSessionLinkOperations({ walletAddress, claudeSessionId, fromNodeId, fromLabel })` → ops for: (a) merge node `HarnessSessionKey { wallet_address, claude_session_id, schema_version }`; (b) edge `(fromNodeId:fromLabel)-[:SAME_SESSION]->(key)`. Merge semantics: re-running with the same inputs is idempotent (same node/edge IDs).

### 2. Caller wiring

Each writer, after building its own session node, appends `buildSessionLinkOperations` with `fromNodeId`/`fromLabel` = its own session node, then writes both in one batch:
- rd-plugin direct sink (`flush.mjs`, WS-A) — `fromLabel: 'ClaudeCodeSession'`.
- gateway ingestor (WS-B) — `fromLabel: 'ClaudeCodeSession'`.
- home bridge (WS-D) — `fromLabel: 'RickydataChatSession'` (scope `rickydata_home`).
- rickygit bridge (WS-D) — `fromLabel: 'RickydataAgentSession'` (scope `rickydata_git`).

### 3. Wallet + session-id normalization

`claudeSessionId` is the Claude Code session UUID from the hook payload; `walletAddress` lowercase. All four writers MUST pass identical `(walletLower, claudeSessionUuid)` for a given session or the star fails to converge.

## Verification plan

1. SDK unit tests (`sdk-link`): `sessionLinkNodeId` stable across calls; `buildSessionLinkOperations` idempotent; wallet-case insensitivity.
2. Cross-harness E2E: drive the same `claudeSessionId` from ≥2 writers, then assert `SAME_SESSION` in-degree ≥2 on the `HarnessSessionKey` node (this is the SPEC-006 step-4 gate assertion).
3. KQL check (parameterized in `scripts/e2e/kql.mjs`):
   ```
   MATCH (k:HarnessSessionKey {claude_session_id: $sid})<-[:SAME_SESSION]-(s)
   RETURN k.node_id, count(s) AS in_degree, collect(labels(s)) AS sources
   ```

## Production Proof

> _No proof yet._
