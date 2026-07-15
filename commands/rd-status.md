---
description: Show rd-plugin connection, encryption, sink, and tracking status
---

Report the current state of rd-plugin as a compact dashboard. Read `~/.rickydata/config.json` for configuration and check live connectivity.

**Gather:**

1. **Connection** — test `{api_url}/api/health` (or a lightweight read against `{api_url}`). Report reachable / unreachable and the resolved `api_url` (env `RICKYDATA_API_URL` overrides config).

2. **Sink** — report the resolved sink and why: env `RICKYDATA_KG_SINK` > config `sink` > auto (`direct` when `private_key` present, else `off`). This is the single most important line — it tells the user whether anything is being captured at all.

3. **Encryption mode** — if a `private_key` is configured, call `GET {api_url}/api/v1/auth/encryption-status` with `X-KF-API-Key: {api_key}` and, when `~/.rickydata/derive-session.json` holds a valid (non-error) session, also `X-Derive-Session-Id` and `X-Derive-Key`. Map the response:
   - `mode: "sign_to_derive"` and `user_key_present: true` → `api_key+s2d` (show the wallet address).
   - `mode: "plaintext"` or `"server_hkdf"` and no local `private_key` → `api_key`.
   - `private_key` configured locally but `mode != "sign_to_derive"` → `s2d_failed (re-run /rd-setup)`; if a sentinel is present in `~/.rickydata/derive-session.json`, show its error.
   - Request itself 401s → connection row fails, encryption row shows `unknown (auth failed)`.
   - If `tee_trust_state` is not `trusted` or `release_posture` is stricter than `permissive`/`audit`, add a one-line warning.

4. **Tracking** — from config: `track_messages`, `track_files`, `track_git`, and top-level `enabled`. Note any `excluded_directories`.

5. **Queue & write health** — the three invariants of a healthy write pipeline (all should be 0):
   - **Retry queue**: count `*.json` files in `~/.rickydata/queue/rd-plugin/` (offline retry backlog; nonzero is fine transiently, drains on next flush).
   - **Dead-letter**: count files in `~/.rickydata/queue-failed/rd-plugin/` (writes that exhausted retries — nonzero means data is stranded and needs manual replay).
   - **Unflushed quiet logs**: pending logs whose events postdate their last flush record and have been quiet >6h (the recovery sweeper's target set; persistently nonzero means recovery is not keeping up). Compute with:

```bash
node --input-type=module -e "
import fs from 'node:fs'; import path from 'node:path'; import os from 'node:os';
const base = path.join(os.homedir(), '.rickydata/state/rd-plugin');
let flushed = {}; try { flushed = JSON.parse(fs.readFileSync(path.join(base, 'state.json'), 'utf8')).flushed ?? {}; } catch {}
const now = Date.now();
for (const dir of ['pending', 'codex-pending']) {
  const d = path.join(base, dir); let n = 0;
  try { for (const f of fs.readdirSync(d)) {
    if (!f.endsWith('.jsonl')) continue;
    const m = fs.statSync(path.join(d, f)).mtimeMs;
    if (now - m <= 6*3600*1000) continue;
    const t = Date.parse(flushed[f.slice(0, -6)]?.updatedAt ?? '');
    if (!Number.isFinite(t) || m > t) n++;
  } } catch {}
  console.log(dir + ' unflushed quiet: ' + n);
}"
```

6. **Codex** — read `~/.codex/config.toml` (if present) and report:
   - **Wired** — whether any hook `command = "..."` line references `dist/codex-capture.mjs`. Report wired/not-wired (and, if partially wired, which of the 5 events — `UserPromptSubmit`, `PreToolUse`, `PermissionRequest`, `PostToolUse`, `Stop` — are missing).
   - **`codex_repo_owners`** — the effective allowlist from `~/.rickydata/config.json`: report the configured list, or "all owners (unset)" when the key is absent or `["*"]`.
   - **Pending events** — count files in `~/.rickydata/state/rd-plugin/codex-pending/` (Codex sessions with buffered events awaiting flush).
   - If `~/.codex/config.toml` is absent or not wired, the next action is: `node ${CLAUDE_PLUGIN_ROOT}/dist/setup-codex.mjs` (dry run first, then `--apply`).

7. **Recent activity** — optionally, count this wallet's sessions captured today/this week via a KQL read (see the rd-query skill).

**Output** as a clear dashboard with a status marker per row. Lead with the sink line. Example shape:

```
rd-plugin status

Connection
  API:  connected (http://34.60.37.158)
  Sink: direct  (auto: private_key present)

Encryption
  Mode:   api_key+s2d
  Wallet: 0xb3e6...a113
  Session expires: 2026-07-13T10:00:00Z

Tracking
  Enabled:  yes
  Messages: on   Files: on   Git: on
  Excluded: (none)

Write health
  Retry queue:   0
  Dead-letter:   0
  Unflushed quiet logs: 0 (claude) / 0 (codex)

Codex
  Wired:  yes (5/5 events)
  Owners: all owners (unset)
  Pending events: 0

Config: ~/.rickydata/config.json
Logs:   ~/.rickydata/logs/rd-plugin.log
```

If anything is wrong, list a specific next action (usually: re-run `/rd-setup`, check the sink resolution, or `node ${CLAUDE_PLUGIN_ROOT}/dist/setup-codex.mjs` for unwired Codex). For nonzero dead-letter: inspect the entry's `url`/`body`/`lastError` and replay it with the stored method + Bearer + `X-Derive-Session-Id`/`X-Derive-Key` headers from `~/.rickydata/derive-session.json`; delete the file only after a 2xx. For persistent unflushed quiet logs: run `node ${CLAUDE_PLUGIN_ROOT}/dist/flush.mjs <sessionId>` (or `codex-flush.mjs`) directly and check `~/.rickydata/logs/rd-plugin.log` for the failure.
