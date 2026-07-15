# rd-plugin

**Your Claude Code sessions, in your own knowledge graph.**

rd-plugin is a Claude Code plugin from [rickydata](https://rickydata.org) that captures your coding sessions — complete observable prompts, turns, tool calls and results, files touched, commands run, and repository/branch/commit identity — into a wallet-scoped knowledge graph on KFDB, encrypted with a key only your wallet can derive. It behaves identically whether you run Claude Code on your own machine or on the rickydata remote TEE stack. Hidden model reasoning is never part of this contract.

Nothing is captured until you connect a wallet. Turn it off any time.

## Install

```bash
claude plugin marketplace add rickycambrian/rd-plugin
claude plugin install rd-plugin@rickydata
```

Then, inside Claude Code:

```
/rd-setup
```

Without a wallet configured, the plugin loads but every hook is a no-op — nothing is captured, nothing is sent. Setup is the moment you opt in.

## What you get

Once connected, ask Claude about your own history:

- `/rd-sessions` — recent sessions, with tool-call and file counts.
- `/rd-search <query>` — semantic search across your sessions, code, and commits.
- `/rd-status` — connection, encryption mode, and tracking status at a glance.

Everything is scoped to your wallet. Your graph is yours.

At `SessionStart`, the same wallet also authenticates a read-only request to
rickydata_home's compiled context-pack endpoint. Claude receives the complete
budgeted pack for the current repository: invariants, verification gates,
in-progress work, wiki claims and sources, lessons, prior human decisions,
known traps, open questions, the exact selected-item manifest, exclusions, and
source-health status. The exact rendered block is stored as an immutable private
content artifact and linked to the session through a `ContextDeliveryReceipt`.
The injected block carries a reproducibility hash. If Home
is unavailable, the plugin labels its smaller answer-sheet fallback
`INCOMPLETE`; it never presents fallback context as complete.

## How it works

rd-plugin captures in two stages so it never slows you down:

1. A fast appender runs on each hook event and just buffers the event.
2. A detached flusher runs at the end of a turn/session, builds a schema-v3 trace, stores exact observables as immutable content-addressed artifacts, and writes graph references only after those artifact writes succeed or are durably queued.

AskUser and permission interactions also emit canonical `DecisionObservation`
records with the exact question, options displayed, and selected answer when the
hook supplies one. This lets later DecisionPacks join a human touch point to the
session and evidence actually visible at that moment.

### Sink modes

| Sink | When | Where keys live |
|---|---|---|
| `direct` | Local machine, wallet configured | On your machine; writes go straight to KFDB with your derived key |
| `gateway` | rickydata remote TEE stack | Never in the sandbox — the plugin writes bounded artifact-first spool records; a trusted gateway ingestor validates and performs the wallet-scoped artifact and graph writes server-side |
| `off` | No wallet, or explicitly disabled | Nowhere — hooks no-op |

Resolution order: env `RICKYDATA_KG_SINK` > config `sink` > auto (`direct` when a wallet key is present, otherwise `off`).

The same schema-v3 graph is produced either way, so a session captured locally and one captured remotely are indistinguishable in your graph.

## Privacy model

- **Wallet-scoped.** Every write is encrypted under a key derived from a signature by your wallet (sign-to-derive). The server stores ciphertext it cannot read; nobody but your wallet can decrypt it.
- **Keys never enter the remote sandbox.** In `gateway` mode the plugin writes only spool files; the derive key lives server-side in the TEE, released to a trusted ingestor — not to the agent sandbox.
- **Fail-open, always.** A tracking hook must never break or slow a session. Every entrypoint catches its own errors and exits cleanly.

See [docs/PRIVACY.md](docs/PRIVACY.md) for the full model, and [docs/SETUP.md](docs/SETUP.md) for step-by-step configuration.

## Codex sessions

rd-plugin captures [Codex](https://developers.openai.com/codex) sessions into the same knowledge graph, under the same wallet, as Claude Code. Wiring is a separate one-time step because Codex hooks live in `~/.codex/config.toml`, not the Claude Code plugin hook system:

```bash
node <path-to-rd-plugin>/dist/setup-codex.mjs --apply
```

By default every GitHub-remoted repo is captured (matching the Claude Code path). Set `codex_repo_owners` via `/rd-setup`'s arg form to restrict capture to specific GitHub owners, or `*` to make the "all owners" behavior explicit. See [docs/SETUP.md](docs/SETUP.md#codex-sessions) for the trust-prompt caveat and the full flow.

## Turning it on and off

**Locally** — set `"enabled": false` in `~/.rickydata/config.json`, or `"sink": "off"`, or export `RICKYDATA_KG_SINK=off`. Any of these fully disables capture.

**Remotely** — capture is gated on a per-wallet setting. Disable it with one API call to the gateway; the next run captures nothing. See [docs/PRIVACY.md](docs/PRIVACY.md#disabling).

## License

[AGPL-3.0](LICENSE). rd-plugin is developed and operated by rickydata against the KFDB backend service.
