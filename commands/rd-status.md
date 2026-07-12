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

5. **Queue** — count files in `~/.rickydata/queue/rd-plugin/` (offline retry backlog).

6. **Recent activity** — optionally, count this wallet's sessions captured today/this week via a KQL read (see the rd-query skill).

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

Queue
  Pending: 0

Config: ~/.rickydata/config.json
Logs:   ~/.rickydata/logs/rd-plugin.log
```

If anything is wrong, list a specific next action (usually: re-run `/rd-setup`, or check the sink resolution).
