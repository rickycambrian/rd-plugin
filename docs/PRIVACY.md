# Privacy model

rd-plugin is built so that your session data is readable only by your wallet, and so that a tracking hook can never break or slow a coding session. This document explains exactly what is collected, how it is protected, and how to turn it off.

## The one rule

Your captured sessions are **private data**, scoped to your wallet. They travel a wallet-keyed path end to end and are stored as ciphertext the server cannot read.

## Wallet-scoped encryption (sign-to-derive)

Writes are encrypted with a key derived from a signature by your wallet, not with a key the server holds:

1. rd-plugin requests an EIP-712 challenge from KFDB.
2. Your wallet signs it locally (your `private_key` never leaves your machine in `direct` mode).
3. The signature yields a deterministic key. Signing the same challenge with the same wallet always reproduces the same key, so you never lose access as long as you keep the wallet.
4. Data is encrypted under that key and written under your wallet address (lowercased) in the graph.

The server stores ciphertext and a session reference. It cannot decrypt your data without a signature from your wallet — a database breach or an administrator cannot recover it.

## Keys never enter the remote sandbox

When you run Claude Code on the rickydata remote TEE stack, rd-plugin runs in **gateway sink** mode:

- The plugin inside the sandbox writes only **spool files** to a local directory. No API key, no wallet key, and no network calls happen inside the sandbox.
- A trusted gateway-side ingestor — outside the agent sandbox, inside the TEE — reads the spool and performs the wallet-scoped write using a derive session that was established when you enabled remote capture. The derive key is released to that ingestor, never to the agent.

This means even on shared remote infrastructure, your wallet key is never exposed to the code executing your session.

## What is collected

When capture is enabled, rd-plugin records the shape of your Claude Code sessions:

- Session boundaries (start/end, working directory, model).
- Prompts and turns (when `track_messages` is on).
- Tool calls and their names/arguments/results.
- Files edited (when `track_files` is on) and git operations (when `track_git` is on).

All of it is encrypted under your wallet as described above.

## What is never collected

- Your `private_key` or wallet signature material — these stay local (`direct` mode) or in the TEE (`gateway` mode); they are never written to the graph.
- Data from directories listed in `excluded_directories`.
- Anything at all when the sink resolves to `off` (no wallet configured, or explicitly disabled).

## Fail-open

Privacy and reliability are both non-negotiable. Every plugin entrypoint catches its own errors and exits cleanly, so a network hiccup, a malformed transcript, or a KFDB outage degrades to "nothing captured this time" — never a broken or hung session.

## Disabling

**Locally**, any one of these fully stops capture:

- `"enabled": false` in `~/.rickydata/config.json`
- `"sink": "off"` in the same file
- `export RICKYDATA_KG_SINK=off`

**Remotely**, capture is gated on a per-wallet setting. Disable it with one call to the gateway:

```bash
curl -X POST https://agents.rickydata.org/wallet/knowledge-graph/disable \
  -H "Authorization: Bearer <YOUR_WALLET_TOKEN>"
```

Disabling clears the server-side derive session, so even a spool file left behind cannot be ingested. The next run captures nothing.

## Non-goals

- **No hosted keyless tier.** rd-plugin does not offer a mode where rickydata holds keys on your behalf. Encryption is bring-your-own-wallet only; if you do not configure a wallet, nothing is captured.

## License

rd-plugin is licensed [AGPL-3.0](../LICENSE) and operates against the KFDB backend service.
