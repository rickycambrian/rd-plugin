---
description: List your recent Claude Code sessions captured by rd-plugin
argument-hint: [count]
---

Show the @1 most recent Claude Code sessions from the caller's wallet-scoped knowledge graph. Default to 5 if no count is given; cap at 20.

Query via the KFDB MCP server (see `.mcp.json`) or a KQL read against `{api_url}/api/v1/kql`, scoped to the caller's wallet. Order by `started_at` descending:

```
MATCH (s:ClaudeCodeSession {wallet_address: $wallet})
RETURN s ORDER BY s.started_at DESC LIMIT $count
```

`$wallet` is the caller's wallet address, lowercased; the sign-to-derive headers scope the read to that wallet's private data.

**For each session, show:**

1. Date/time started and duration.
2. Workspace / project directory.
3. Tool-call count.
4. Files modified (count, and a few key paths).
5. Outcome, if recorded.
6. A one-line summary or the initial prompt.

**Present** as a clean list. Example shape:

```
Recent sessions (last 5)

1. 2026-07-11 10:30   (45 min)   workspace: rd-plugin
   tools: 23   files: 8 modified
   "implement plugin hooks and dist build"

2. 2026-07-10 15:15   (30 min)   workspace: rickydata_SDK
   tools: 15   files: 3 modified
   "add session-link builders"
```

If the user asks about a specific session, offer to expand it: full tool-call list, file changes, or the cross-harness view (sessions sharing a `HarnessSessionKey` via `SAME_SESSION`). If no sessions are found, note that capture may be off (check `/rd-status`) or that this is a fresh wallet.
