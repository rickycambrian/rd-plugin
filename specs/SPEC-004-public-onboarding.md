# SPEC-004 — public onboarding (WS-E)

**Status**: IN PROGRESS — owner `docs-onboarding`. Conforms to [SPEC-000](./SPEC-000-master.md) frozen interface contract v1. D1 install path VALIDATED (both local-path and GitHub-form, see SPEC-000 Decision log); Codex onboarding design added below, production proof pending a fresh-user run.
**Scope**: `README.md`, `docs/`, `commands/`, `skills/`, `.mcp.json`, `commands/rd-setup.md` → `dist/setup.mjs`, `commands/rd-setup.md` → `dist/setup-codex.mjs`.

## Goal

Anyone can install rd-plugin from the public marketplace and connect their own wallet in one command, with a graceful no-op when no wallet is configured. No rickydata-internal knowledge required; nothing captured until the user opts in.

## Current state

- `README.md:1` — public landing page, includes install, sink modes, privacy model, and a Codex sessions section.
- `.claude-plugin/marketplace.json:1` — marketplace `rickydata`, plugin `rd-plugin`, `source: "./"` (D1 VALIDATED, SPEC-000 Decision log: local-path form AND GitHub form both proven in a fresh isolated `$HOME`, `rd-plugin@rickydata` v1.0.0, scope user, enabled — see SPEC-000 D1 row).
- `docs/`, `commands/`, `skills/`, `.mcp.json` all exist and are populated.
- Reference (R1, reference-only): `knowledgeflow_plugin_kfdb/plugin/commands/kf-*.md`, `.../skills/*/SKILL.md`, `.../.mcp.json` — rewritten fresh, zero `cambrian`/`knowledgeflow` branding.

## Exact changes

### 1. Install path (public)

Per SPEC-000 §Identity:
```
claude plugin marketplace add rickycambrian/rd-plugin
claude plugin install rd-plugin@rickydata
```
Then `/rd-setup` inside Claude Code. D1 is validated for both the local directory form and the GitHub form, in a fresh isolated `$HOME` (SPEC-000 Decision log D1 row; see also SPEC-000's "D1 GitHub-form marketplace install validated" note).

### 2. `/rd-setup` (`commands/rd-setup.md` → `dist/setup.mjs`)

- Writes/updates `~/.rickydata/config.json` (SPEC-000 §Config) — never renames existing keys; adds `enabled`, `sink`, `excluded_directories` only when the user opts in.
- Optional S2D wallet enrollment: prompt for a 32-byte hex private key or BIP-39 mnemonic (derive `m/44'/60'/0'/0/0`); store as `private_key`; verify one derive round-trip (`/api/v1/auth/derive-challenge` → sign EIP-712 → `/api/v1/auth/derive-key`) before confirming; on failure remove `private_key` and report the error. Never echo the key. `0600` perms.
- **Verification is now built into `setup.mjs` itself**, not just the interactive `/rd-setup` LLM flow: `node setup.mjs private_key=0x... [api_key=...] [--force]` (the arg form) performs the same one S2D round-trip automatically whenever it persists a *new* `private_key`, and strips it back out on failure with a reported reason (`src/lib/setup-core.ts` `applyWalletVerification`, wired in `src/setup.ts`). `--skip-verify` bypasses this for offline/air-gapped setups. Plain `node setup.mjs` with no `key=value` args remains status-only and never writes. `/rd-setup`'s own interactive flow (step 4 in `commands/rd-setup.md`) still documents a manual curl-based check for keys entered at a prompt rather than passed on the command line — the two paths converge on the same contract (remove-on-failure, never leave a broken key in place).
- Wallet address is DERIVED from the key, lowercased in all graph props (SPEC-000 §Config).

### 3. No-wallet graceful no-op

Per SPEC-000 §"Sink resolution": with no usable config the sink auto-resolves to `off` — hooks load but every entrypoint no-ops (fail-open, Invariant 1). The README and `docs/SETUP.md` state this plainly: install is safe and silent until `/rd-setup`.

### 4. Commands + skills + MCP

- `commands/{rd-setup,rd-status,rd-search,rd-sessions}.md` (SPEC-000 §Identity command list).
- `skills/rd-query/SKILL.md`, `skills/session-analysis/SKILL.md`.
- `.mcp.json` — KFDB MCP server, endpoint env-driven (`http://34.60.37.158`), no hardcoded secrets.

### 5. R4 — hosted keyless tier: OUT OF SCOPE

A hosted tier where rickydata holds keys for users is explicitly **not** in this program. Onboarding is BYO-wallet only. Documented as a non-goal in `docs/PRIVACY.md`.

### 6. Codex onboarding (`commands/rd-setup.md` → `dist/setup-codex.mjs`)

Codex sessions land in the same wallet-scoped graph as Claude Code (SPEC-005), but Codex hooks live outside the Claude Code plugin hook system (`~/.codex/config.toml`, not anything `claude plugin install` touches), so wiring is a separate opt-in step:

- `node dist/setup-codex.mjs` — dry run (default): reads `~/.codex/config.toml`, classifies each of the 5 Codex hook events (`UserPromptSubmit`, `PreToolUse`, `PermissionRequest`, `PostToolUse`, `Stop`) as already-wired / legacy (`kfdb-codex-hook.mjs`) / missing, and prints what would change. No file is touched.
- `node dist/setup-codex.mjs --apply` — performs the edit: repoints legacy command lines in place, appends fresh `[[hooks.<Event>]]` blocks for any missing event, and writes a timestamped backup (`config.toml.bak-rd-plugin-<ts>`) first. Operates line-based on the TOML text (no TOML library, zero new deps) — the transform functions live in `src/codex/toml-wiring.ts`, pure and unit-tested (`tests/toml-wiring.test.ts`), with the CLI (`src/setup-codex.ts`) as a thin IO wrapper.
- If `~/.codex/config.toml` doesn't exist yet, the command prints setup instructions plus the exact TOML block to add, and exits 0 (fail-open, same as every other entrypoint) rather than erroring.
- The hook command path is resolved from the running script's own `import.meta.url`, so it works whether rd-plugin is installed via the plugin marketplace cache or a local git clone.
- **Trust caveat, always printed**: Codex pins a `trusted_hash` per hook command under `[hooks.state]`; the first interactive `codex` session after wiring prompts once to trust the new command (accept it or the hooks stay inert — fail-open), and `codex exec` (non-interactive) silently skips untrusted hooks unless run with `--dangerously-bypass-hook-trust`.
- `codex_repo_owners` (SPEC-005, amended by `832440c`): unset (the default) = no owner gate, every GitHub-remoted repo is captured, matching the Claude Code path; a configured list restricts capture to those owners; `['*']` makes "capture all owners" explicit. Non-git directories and git directories without a `github.com` origin are never captured. Documented in README.md and `docs/SETUP.md` (§Codex sessions) and surfaced in `/rd-status`'s Codex section.
- **Event list note**: the 5 events wired here (`UserPromptSubmit`, `PreToolUse`, `PermissionRequest`, `PostToolUse`, `Stop`) were taken from the live, already-wired reference `~/.codex/config.toml` (SPEC-005 cutover), which differs from the Claude Code plugin hook event set (`SessionStart`, `UserPromptSubmit`, `PostToolUse`, `Notification`, `Stop` — see `hooks/hooks.json`); the two harnesses fire different named events for the same lifecycle points.

## Verification plan

1. `claude plugin marketplace add <path>` + `claude plugin install rd-plugin@rickydata` → plugin enabled (D1 VALIDATED for both local-path and GitHub-form — see SPEC-000 Decision log).
2. Fresh machine, no `~/.rickydata/config.json`: install, start a session, assert zero writes and zero errors (no-op).
3. `/rd-setup` with the test wallet key → `~/.rickydata/config.json` written, derive round-trip succeeds, `/rd-status` shows `api_key+s2d`.
4. Brand gate: `git grep -il cambrian -- ':!LICENSE'` empty; no `knowledgeflow` branding in `commands/`, `skills/`, `docs/`, `README.md`.
5. Codex wiring, fresh user: `node dist/setup-codex.mjs` (dry run, no existing config) → prints create-instructions; create `~/.codex/config.toml`, re-run `--apply` → all 5 events wired, backup file present; `codex exec` after trusting the hook → capture appended, `HarnessSessionKey` shared with a Claude Code session on the same session UUID (cross-harness link, SPEC-003).

## Production Proof

**Setup verification + arg-form S2D round-trip**: covered by unit tests (`applyWalletVerification` in `tests/setup-core.test.ts`) — the live network round-trip against KFDB is exercised by the existing `/rd-setup` production proof path (SPEC-000/006 full gate); no separate live proof captured for the arg-form invocation specifically.

**Codex wiring (`setup-codex.mjs`)**: unit-tested (`tests/toml-wiring.test.ts`, pure transforms) and `npx tsc --noEmit` / `node scripts/verify-dist.mjs` clean. **Not yet run against a fresh user's real `~/.codex/config.toml`** — verification plan step 5 above is the pending fresh-user proof; the live reference `config.toml` used to derive the exact TOML shape belongs to an already-wired operator machine (SPEC-005 cutover), not a fresh install.
