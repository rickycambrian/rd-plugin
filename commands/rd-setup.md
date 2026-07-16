---
description: Connect rd-plugin to your wallet and KFDB, with optional wallet-based encryption
argument-hint: [api_key or private_key=0x...]
---

Configure rd-plugin. This runs the setup entrypoint and, if needed, walks you through wallet enrollment.

**Primary path — run the setup entrypoint:**

```bash
node "${CLAUDE_PLUGIN_ROOT}/dist/setup.mjs"
```

Plain `node setup.mjs` with no `key=value` arguments is **status-only** — it never writes anything, it just prints the current (masked) config and directory status.

Pass the API key through if one was provided as an argument (@1):

```bash
node "${CLAUDE_PLUGIN_ROOT}/dist/setup.mjs" api_key=@1
```

This is the **arg form**: any `key=value` pair on the command line persists that key to `~/.rickydata/config.json` (existing keys need `--force` to overwrite). When the arg form persists a new `private_key`, `setup.mjs` now performs the sign-to-derive verification round-trip itself (see step 4 below) and reports success or failure in its own output — you do not need to also run the manual curl-based check for that case, though the walkthrough below still documents it since the interactive flow may enroll a key that was typed at a prompt rather than passed as `private_key=...` on the command line.

The entrypoint writes `~/.rickydata/config.json`, creating `~/.rickydata/` if absent, and sets the file to `0600`. It never renames existing keys in that file — rd-plugin shares it with other rickydata tools.

**Credential model — a wallet key alone is a complete setup:**

- `private_key` only (no `api_key`): every KFDB request is signed per-request with the wallet via ERC-8128 HTTP signatures. KFDB auto-provisions a tenant for a new wallet on first request — **no operator-issued API key is needed**. `/rd-setup private_key=0x...` is the entire onboarding for a new user.
- `api_key` only: legacy Bearer mode, still fully supported.
- Both: Bearer is used for transport auth (byte-identical to before); the wallet key still powers sign-to-derive encryption.

**What the entrypoint does, and how to explain it to the user:**

1. **Existing config check** — reads `~/.rickydata/config.json`. If a credential (`api_key` or `private_key`) is already present and no argument was given, report the current configuration with values masked (show only a short prefix). Do not overwrite silently.

2. **Credential** — if an API key was provided (@1) or prompted for, store it as `api_key`. If the user has no API key, that is fine — a `private_key` alone authenticates via ERC-8128 (see above). Set `api_url` to `http://34.60.37.158` unless one is already configured. Confirm connectivity with a lightweight read before declaring success.

3. **Wallet key (sign-to-derive encryption + ERC-8128 auth)** — offer it, and explain plainly: writes are encrypted with a key derived from a signature by the user's Ethereum wallet; the server stores only ciphertext it cannot read; re-signing the same challenge with the same wallet always reproduces the same key, so access is never lost as long as the wallet is kept. Without an `api_key`, the same wallet key also signs each request for authentication.
   - If declined and an `api_key` exists: stop here. API-key-only mode is fine; encryption is strictly additive.
   - If accepted: prompt for either a 32-byte hex private key (64 hex chars, optional `0x`) or a 12/24-word BIP-39 mnemonic (derive the first account via `m/44'/60'/0'/0/0`). Store the resulting key as `private_key`. **Never echo the key value, even masked.**

4. **Verify enrollment** with one derive round-trip before confirming:
   - `POST {api_url}/api/v1/auth/derive-challenge` → expect `200` and `{challenge_id, typed_data}`.
   - Sign the returned EIP-712 typed data with the wallet key.
   - `POST {api_url}/api/v1/auth/derive-key` with `{challenge_id, signature, address}` → expect `200` and `{session_id, wallet_address, expires_at}`.
   - If either call is non-200: remove `private_key` from the config and report the specific error. Do not leave a bad key in place — hooks would silently fall back to API-key-only and the user would be confused.

5. **Success output** — show the API URL, the masked credential(s), and (if enrolled) the derived wallet address and session expiry. Point the user at `/rd-status` to verify.

6. **Optional: Codex wiring** — if the user also uses Codex, offer to wire it:

```bash
node "${CLAUDE_PLUGIN_ROOT}/dist/setup-codex.mjs"
```

This is a dry run by default and only prints what would change. If the user wants to proceed, re-run with `--apply`. Explain the trust caveat the command prints: Codex prompts once, interactively, to trust the newly wired hook command; `codex exec` (non-interactive) needs `--dangerously-bypass-hook-trust` to run an untrusted hook. This step is optional and independent of the rest of setup — decline it and Claude Code capture still works normally.

**Rules:**

- The wallet address is always derived from the private key — never ask for it separately.
- Validate the private key is 64 hex characters before attempting a derive.
- Never display the full API key or any private key after entry.
- If wallet enrollment fails but an `api_key` exists, API-key-only setup still succeeds. Encryption never blocks basic setup.
- After setup, capture begins on the next session. To stay off, set `enabled: false` or `sink: off`.
