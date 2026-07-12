# Setup

This guide walks through installing rd-plugin and connecting your wallet. It takes a couple of minutes and captures nothing until you finish.

## 1. Install the plugin

From a terminal:

```bash
claude plugin marketplace add rickycambrian/rd-plugin
claude plugin install rd-plugin@rickydata
```

`marketplace add` registers the `rickydata` marketplace; `install` enables `rd-plugin` at user scope. At this point the plugin is loaded but idle — with no wallet configured, every hook is a no-op.

## 2. Run setup

Inside Claude Code:

```
/rd-setup
```

`/rd-setup` creates or updates `~/.rickydata/config.json` and, if you choose, enrolls your wallet for user-controlled encryption. It never prints your private key and never renames existing config keys (rd-plugin shares this file with other rickydata tools).

## 3. Configuration reference

`~/.rickydata/config.json`. rd-plugin reads the existing keys and may add the optional ones; it never removes or renames keys it did not create.

| Key | Type | Default | Purpose |
|---|---|---|---|
| `api_url` | string | `http://34.60.37.158` | KFDB base URL. Override per-run with `RICKYDATA_API_URL`. |
| `api_key` | string | — | Bearer token for KFDB. |
| `private_key` | string (64 hex) | — | Wallet key used for sign-to-derive. Your wallet address is derived from it; it is never sent anywhere. |
| `track_messages` | bool | `true` | Capture prompts/turns. |
| `track_files` | bool | `true` | Capture file edits. |
| `track_git` | bool | `true` | Capture git operations. |
| `log_level` | string | `info` | Plugin log verbosity → `~/.rickydata/logs/rd-plugin.log`. |
| `enabled` | bool | `true` when `private_key` present | Master on/off for capture. |
| `sink` | `direct` \| `gateway` \| `off` | auto | Where captures go (see below). |
| `excluded_directories` | string[] | `[]` | Working directories to skip entirely. |

A minimal local config looks like this (placeholders — use your own values):

```json
{
  "api_url": "http://34.60.37.158",
  "api_key": "<YOUR_KFDB_API_KEY>",
  "private_key": "<YOUR_64_HEX_WALLET_KEY>",
  "track_messages": true,
  "track_files": true,
  "track_git": true,
  "log_level": "info"
}
```

> Never commit this file or paste real keys into chats, issues, or logs. Set it to `0600` permissions (`/rd-setup` does this for you).

## 4. Choosing a sink

You usually don't set `sink` — the default resolves correctly:

- **`direct`** (auto when `private_key` is present): writes go from your machine straight to KFDB, encrypted with your derived key.
- **`gateway`**: used when running on the rickydata remote TEE stack. The runner sets `RICKYDATA_KG_SINK=gateway` and a spool directory; the plugin writes only spool files and your key never enters the sandbox.
- **`off`**: no capture.

Resolution order: env `RICKYDATA_KG_SINK` > config `sink` > auto.

## 5. Verify

```
/rd-status
```

You should see the API connected, encryption mode `api_key+s2d` (if you enrolled a wallet), and which tracking features are on. If the encryption row shows an S2D failure, re-run `/rd-setup` — a bad `private_key` is removed automatically rather than left in place.

## 6. Backfill (optional)

To import your existing local session history once:

```bash
node ~/.claude/plugins/rd-plugin/dist/backfill.mjs --since 30d --limit 200
```

Backfill is bounded, resumable, and idempotent — re-running never creates duplicates. Use `--dry-run` first to see what it would import.

## Filesystem

Everything rd-plugin writes lives under `~/.rickydata/`:

- `config.json` — your configuration (shared with other rickydata tools).
- `derive-session.json` — cached sign-to-derive session.
- `state/rd-plugin/state.json` — flush fingerprints and backfill watermark.
- `queue/rd-plugin/` — offline retry queue.
- `logs/rd-plugin.log` — plugin log.
