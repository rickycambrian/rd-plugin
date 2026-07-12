# SPEC-004 — public onboarding (WS-E)

**Status**: DRAFT — owner `docs-onboarding`. Conforms to [SPEC-000](./SPEC-000-master.md) frozen interface contract v1.
**Scope**: `README.md`, `docs/`, `commands/`, `skills/`, `.mcp.json`, `commands/rd-setup.md` → `dist/setup.mjs`.

## Goal

Anyone can install rd-plugin from the public marketplace and connect their own wallet in one command, with a graceful no-op when no wallet is configured. No rickydata-internal knowledge required; nothing captured until the user opts in.

## Current state

- `README.md:1` — stub landing page (rewritten by this workstream to the polished public README).
- `.claude-plugin/marketplace.json:1` — marketplace `rickydata`, plugin `rd-plugin`, `source: "./"` (D1 VALIDATED, SPEC-000 Decision log).
- No `docs/`, `commands/`, `skills/`, or `.mcp.json` exist yet.
- Reference (R1, reference-only): `knowledgeflow_plugin_kfdb/plugin/commands/kf-*.md`, `.../skills/*/SKILL.md`, `.../.mcp.json` — rewritten fresh, zero `cambrian`/`knowledgeflow` branding.

## Exact changes

### 1. Install path (public)

Per SPEC-000 §Identity:
```
claude plugin marketplace add rickycambrian/rd-plugin
claude plugin install rd-plugin@rickydata
```
Then `/rd-setup` inside Claude Code. D1 is validated for the local directory form; GitHub-form re-validation happens after first push (WS-E, tracked in SPEC-000 Decision log).

### 2. `/rd-setup` (`commands/rd-setup.md` → `dist/setup.mjs`)

- Writes/updates `~/.rickydata/config.json` (SPEC-000 §Config) — never renames existing keys; adds `enabled`, `sink`, `excluded_directories` only when the user opts in.
- Optional S2D wallet enrollment: prompt for a 32-byte hex private key or BIP-39 mnemonic (derive `m/44'/60'/0'/0/0`); store as `private_key`; verify one derive round-trip (`/api/v1/auth/derive-challenge` → sign EIP-712 → `/api/v1/auth/derive-key`) before confirming; on failure remove `private_key` and report the error. Never echo the key. `0600` perms.
- Wallet address is DERIVED from the key, lowercased in all graph props (SPEC-000 §Config).

### 3. No-wallet graceful no-op

Per SPEC-000 §"Sink resolution": with no usable config the sink auto-resolves to `off` — hooks load but every entrypoint no-ops (fail-open, Invariant 1). The README and `docs/SETUP.md` state this plainly: install is safe and silent until `/rd-setup`.

### 4. Commands + skills + MCP

- `commands/{rd-setup,rd-status,rd-search,rd-sessions}.md` (SPEC-000 §Identity command list).
- `skills/rd-query/SKILL.md`, `skills/session-analysis/SKILL.md`.
- `.mcp.json` — KFDB MCP server, endpoint env-driven (`http://34.60.37.158`), no hardcoded secrets.

### 5. R4 — hosted keyless tier: OUT OF SCOPE

A hosted tier where rickydata holds keys for users is explicitly **not** in this program. Onboarding is BYO-wallet only. Documented as a non-goal in `docs/PRIVACY.md`.

## Verification plan

1. `claude plugin marketplace add <path>` + `claude plugin install rd-plugin@rickydata` → plugin enabled (D1 re-check on the pushed GitHub repo).
2. Fresh machine, no `~/.rickydata/config.json`: install, start a session, assert zero writes and zero errors (no-op).
3. `/rd-setup` with the test wallet key → `~/.rickydata/config.json` written, derive round-trip succeeds, `/rd-status` shows `api_key+s2d`.
4. Brand gate: `git grep -il cambrian -- ':!LICENSE'` empty; no `knowledgeflow` branding in `commands/`, `skills/`, `docs/`, `README.md`.

## Production Proof

> _No proof yet._
