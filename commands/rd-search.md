---
description: Search your rd-plugin knowledge graph — sessions, code, commits, commands
argument-hint: <query>
---

Search the caller's wallet-scoped knowledge graph for: @1

Use the KFDB MCP server (configured in `.mcp.json`) and/or KQL reads against `{api_url}/api/v1/kql`. All reads are scoped to the caller's wallet via the sign-to-derive headers (`X-Wallet-Address`, `X-Derive-Session-Id`, `X-Derive-Key`) — results only include this wallet's data.

**Search across entity types** (omit any that return nothing):

1. **Sessions** — recent or relevant `ClaudeCodeSession` nodes matching the query (workspace, initial prompt, date).
2. **Code** — files and symbols touched, with the matching path and a short snippet.
3. **Commits** — git operations captured during sessions (hash, message, branch, files changed).
4. **Commands** — shell commands run, when relevant to the query.

Prefer semantic search where the MCP server exposes it; fall back to a KQL `MATCH` with a `CONTAINS`/property filter, scoped to `wallet_address = <caller wallet, lowercased>`.

**Present results** in a scannable layout grouped by type. For each item show the most identifying fields (date, workspace, path, short excerpt) and a relevance signal when available. Example shape:

```
Search results for "@1"

Sessions (2)
  1. 2026-07-11  workspace: rd-plugin  (38 min)
     "implement two-stage capture and sink resolution"
     6 files modified

Code (2)
  1. src/lib/config.js
     resolveSink(config, env) -> 'direct' | 'gateway' | 'off'

Commits (1)
  1. a1b2c3d  "feat: gateway spool writer"  main  +180 -12
```

Offer to drill into any single result (full tool-call list, file history, or the session timeline). If nothing matches, say so and suggest a broader query or `/rd-sessions` to browse recent activity.
