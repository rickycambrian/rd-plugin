---
name: session-analysis
description: Analyze your Claude Code development patterns — productivity, session quality, file hotspots, and debugging workflows — from the rd-plugin knowledge graph
allowed-tools: WebFetch, mcp__kfdb__*
---

# session-analysis

Turn the caller's captured session history into insight: how work is trending, where time goes, which files churn, and what debugging looks like. All analysis is over the caller's wallet-scoped graph only.

Use the `kfdb` MCP server (`.mcp.json`) where it exposes aggregate/analytics tools; otherwise compute aggregates from KQL reads scoped to `wallet_address = $wallet`.

## When to use

Invoke when the user asks:
- "How productive have I been this week?"
- "What are my coding patterns?"
- "Which files give me the most trouble?"
- "What's my average session length?"
- "Show me my debugging-heavy sessions."

## Analysis types

### Productivity
Aggregate sessions over a window: count, total/average duration, tool calls, files touched. Compare to the prior window for a trend.

### Session quality
Where outcome/quality signals were captured, summarize success rate and flag sessions that stalled or iterated heavily.

### File hotspots
Rank files by number of edits across sessions; surface the most-iterated files as likely complexity or friction points.

### Debugging workflows
Identify high-iteration sessions (many tool calls, repeated edits to the same file, error-then-retry patterns) and summarize the journey for a given file.

## Method

1. Pull the relevant window (default: last 7 days) scoped to the wallet.
2. Compute meaningful aggregates — avoid dumping raw rows.
3. Identify trends and anomalies; compare to a baseline when one exists.
4. Give actionable, specific takeaways, not generic advice.

## Scoping rule

Constrain every query to the caller's wallet (`wallet_address = $wallet`, lowercased). Never mix wallets.

## Example

**User:** "How productive have I been this week?"

**Response:**
> Weekly report (last 7 days):
> - Sessions: 23; total 14.5h; average 38 min.
> - Files touched: 156 across 9 workspaces.
> - Busiest project: rd-plugin (8.5h, 59%).
> - Signal: 3 sessions ran over an hour and re-edited the same file 4+ times — likely friction in `src/lib/config.js`.
>
> Want the hotspot breakdown or the debugging timeline for that file?
