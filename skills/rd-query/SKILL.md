---
name: rd-query
description: Query your wallet-scoped rd-plugin knowledge graph — find past Claude Code sessions, files touched, commits, and commands using natural language
allowed-tools: WebFetch, mcp__kfdb__*
---

# rd-query

Retrieve information from the caller's wallet-scoped knowledge graph captured by rd-plugin: past sessions, file changes, git history, and the commands run during development.

All reads are scoped to the caller's wallet. Use the KFDB MCP server (`.mcp.json`, server name `kfdb`) for semantic search, or KQL/SQL reads against `{api_url}` when a precise graph traversal is needed. Sign-to-derive headers scope every read to the caller's private data.

## When to use

Invoke when the user asks things like:
- "What did I work on yesterday / last week?"
- "Show me recent sessions in this project."
- "What changes did I make to `<file>`?"
- "How did I implement `<feature>`?"
- "Which commands did I run while debugging `<thing>`?"
- "Show sessions that touched both harnesses" (Claude Code + Codex sharing a session).

## Query surfaces

### Sessions
- Recent: `MATCH (s:ClaudeCodeSession {wallet_address: $wallet}) RETURN s ORDER BY s.started_at DESC LIMIT $n`
- By workspace: add `WHERE s.workspace = $workspace`.
- By time: add `WHERE s.started_at > $sinceEpochMs`.

### File history
- Versions of a file: match the code/artifact nodes linked from the wallet's sessions, filtered by path.
- Files in a session: traverse from a `ClaudeCodeSession` to its file nodes.

### Cross-harness view (D6)
- A `HarnessSessionKey` node merges all writers for one session. To see everything about a session:
  ```
  MATCH (k:HarnessSessionKey {claude_session_id: $sid})<-[:SAME_SESSION]-(src)
  RETURN labels(src) AS source, src
  ```

### Semantic search
- Prefer the `kfdb` MCP server's semantic search tools for meaning-based queries over sessions, code, and notes; fall back to KQL `CONTAINS` filters for exact-string needs.

## Scoping rule

Always constrain to `wallet_address = $wallet` (the caller's wallet, lowercased). Never return, or attempt to read, another wallet's data — the derive session enforces this at the server, and queries should reflect the same intent.

## Response format

1. Summarize the total count.
2. List items with identifying details (date, workspace, path, short excerpt).
3. Offer a follow-up drill-down (full tool-call list, diffs, or the cross-harness view).

## Example

**User:** "What did I work on last week?"

**Response:**
> Found 12 sessions in the last 7 days:
> 1. 2026-07-11 — rd-plugin (45 min): implemented capture + flush; 23 tool calls, 8 files.
> 2. 2026-07-10 — rickydata_SDK (30 min): session-link builders; 15 tool calls, 3 files.
>
> Want the full timeline for any of these?
