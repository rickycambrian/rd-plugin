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

Under the hood, `/rd-setup` is a thin wrapper around the `setup.mjs` entrypoint, which you can also run directly:

```bash
# status only — prints the current (masked) config, makes no changes
node ~/.claude/plugins/rd-plugin/dist/setup.mjs

# arg form — persists keys, creating ~/.rickydata/config.json if needed
node ~/.claude/plugins/rd-plugin/dist/setup.mjs private_key=0x... --force
```

A wallet `private_key` alone is a complete setup: every KFDB request is signed per-request with the wallet (ERC-8128 HTTP message signatures), and KFDB auto-provisions a tenant for a new wallet on first request — no operator-issued API key is needed. An `api_key` is optional; when present it is used as legacy Bearer transport auth (`api_key=...` in the arg form).

`node dist/setup.mjs` with no `key=value` arguments is always status-only (never writes). The arg form persists the given keys — an existing key is never silently overwritten; pass `--force` to allow it. When the arg form persists a new `private_key`, `setup.mjs` automatically performs one sign-to-derive round-trip against the configured KFDB before declaring success: on failure it removes the just-persisted `private_key` and prints why, rather than leaving a broken key in place. Pass `--skip-verify` to skip this check for offline/air-gapped setups. `/rd-setup`'s interactive flow performs this same S2D enrollment check as part of its walkthrough (see `commands/rd-setup.md`).

## 3. Configuration reference

`~/.rickydata/config.json`. rd-plugin reads the existing keys and may add the optional ones; it never removes or renames keys it did not create.

| Key | Type | Default | Purpose |
|---|---|---|---|
| `api_url` | string | `http://34.60.37.158` | KFDB base URL. Override per-run with `RICKYDATA_API_URL`. |
| `home_url` | string | `https://rickydata-home-2dbp4scmrq-uc.a.run.app` | rickydata_home base URL used for the authenticated SessionStart context pack. Override per-run with `RICKYDATA_HOME_URL`. |
| `api_key` | string | — | Optional Bearer token for KFDB (legacy). When absent, requests are ERC-8128 wallet-signed instead. |
| `private_key` | string (64 hex) | — | Wallet key used for sign-to-derive encryption and (when no `api_key`) ERC-8128 request signing. Your wallet address is derived from it; the key itself is never sent anywhere. |
| `track_messages` | bool | `true` | Capture prompts/turns. |
| `track_files` | bool | `true` | Capture file edits. |
| `track_git` | bool | `true` | Capture git operations. |
| `log_level` | string | `info` | Plugin log verbosity → `~/.rickydata/logs/rd-plugin.log`. |
| `enabled` | bool | `true` when `private_key` present | Master on/off for capture. |
| `sink` | `direct` \| `gateway` \| `off` | auto | Where captures go (see below). |
| `excluded_directories` | string[] | `[]` | Working directories to skip entirely. |
| `codex_repo_owners` | string[] | unset (= all owners) | Codex-only owner allowlist — see [Codex sessions](#codex-sessions) below. |

A minimal local config looks like this (placeholders — use your own values; `api_key` is optional and only needed for legacy Bearer auth):

```json
{
  "api_url": "http://34.60.37.158",
  "home_url": "https://rickydata-home-2dbp4scmrq-uc.a.run.app",
  "private_key": "<YOUR_64_HEX_WALLET_KEY>",
  "track_messages": true,
  "track_files": true,
  "track_git": true,
  "log_level": "info"
}
```

> Never commit this file or paste real keys into chats, issues, or logs. Set it to `0600` permissions (`/rd-setup` does this for you).

### SessionStart knowledge context

When `private_key` is configured, the SessionStart hook mints a short-lived,
Home-branded wallet token locally and requests
`/api/context-pack?repo=<workspace>&budget=24000&consumer=plugin`. The private
key is never sent. The injected pack includes every selected section plus its
selected/omitted manifests, source failures, coverage status, and
reproducibility hash. Home is preferred because it compiles the connected wiki,
knowledge graph, Mission Control, verification, and human-decision context.
After injection, the exact rendered bytes, pack hash, coverage status, and
explicit omissions are emitted as a canonical `ContextDeliveryReceipt` linked
to the session. This receipt is independent of whether the source was Home or
the bounded fallback.

If Home cannot return a valid `context-pack/v1` within the hook's five-second
budget, rd-plugin falls back to its bounded answer-sheet retrieval. That block
is explicitly marked `CONTEXT COVERAGE — INCOMPLETE`; an empty fallback says so
instead of silently injecting nothing. Set `RICKYDATA_HOME_URL` (or `home_url`)
to point at another Home deployment.

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

You should see the API connected, the auth + encryption mode (`erc8128+s2d` for a wallet-only setup, `bearer+s2d` when an `api_key` is also configured), and which tracking features are on. If the encryption row shows an S2D failure, re-run `/rd-setup` — a bad `private_key` is removed automatically rather than left in place.

## 6. Backfill (optional)

To import your existing local session history once:

```bash
node ~/.claude/plugins/rd-plugin/dist/backfill.mjs --since 30d --limit 200
```

Backfill is bounded, resumable, and idempotent — re-running never creates duplicates. Use `--dry-run` first to see what it would import.

## Codex sessions

[Codex](https://developers.openai.com/codex) sessions are captured into the same wallet-scoped graph as Claude Code, but wiring is a separate step: Codex hooks live in `~/.codex/config.toml`, which is outside the Claude Code plugin hook system, so nothing installs it automatically.

```bash
node ~/.claude/plugins/rd-plugin/dist/setup-codex.mjs --apply
```

Run it without `--apply` first — that's the default and only prints what would change (a dry run: which of Codex's 5 hook events are already wired, which would be repointed from a legacy hook script, and which would get a fresh block appended). `--apply` performs the edit and writes a timestamped backup (`config.toml.bak-rd-plugin-<timestamp>`) before touching anything. If `~/.codex/config.toml` doesn't exist yet, the command prints the exact TOML block to create it with instead of failing.

**Trust prompt caveat**: Codex pins a `trusted_hash` per hook command under `[hooks.state]` in `config.toml`. After wiring, the next *interactive* `codex` session prompts once to trust the new command — accept it, or the hooks stay inert (fail-open; your session is unaffected either way). `codex exec` (non-interactive / scripted) silently skips untrusted hooks unless run with `--dangerously-bypass-hook-trust`.

**`codex_repo_owners` semantics**: by default (the key absent from `~/.rickydata/config.json`) Codex capture has no owner gate — any working directory whose git origin remote is on `github.com` is captured, matching the Claude Code path. To restrict capture to specific GitHub owners, set a list via the setup arg form:

```bash
node ~/.claude/plugins/rd-plugin/dist/setup.mjs codex_repo_owners=your-org,another-org --force
```

Setting the list to `*` (i.e. `codex_repo_owners=*`) makes the "capture all owners" default explicit rather than leaving the key unset. Non-git working directories, and git working directories whose origin is not on `github.com`, are never captured regardless of this setting.

## Filesystem

Everything rd-plugin writes lives under `~/.rickydata/`:

- `config.json` — your configuration (shared with other rickydata tools).
- `derive-session.json` — cached sign-to-derive session.
- `state/rd-plugin/state.json` — flush fingerprints and backfill watermark.
- `state/rd-plugin/codex-pending/` — per-session Codex event logs awaiting flush.
- `queue/rd-plugin/` — offline retry queue.
- `logs/rd-plugin.log` — plugin log.
