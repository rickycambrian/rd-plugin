# rd-plugin

**rickydata session tracking for Claude Code.** Captures your coding sessions — prompts, turns, tool calls, files touched, commands run — into your own wallet-scoped knowledge graph on KFDB, with user-controlled encryption (sign-to-derive). Works identically on your local machine and on the rickydata remote TEE stack.

> Status: under active development. Install instructions will be finalized with v0.1.0.

## Install

```bash
claude plugin marketplace add rickycambrian/rd-plugin
claude plugin install rd-plugin@rickydata
```

Then run `/rd-setup` inside Claude Code to connect your wallet. Without a wallet configured, the plugin loads but all hooks no-op — nothing is captured, nothing is sent.

## Principles

- **Fail-open, always.** A tracking hook must never break or slow a coding session.
- **Wallet-scoped.** Your data is written under your wallet with user-controlled encryption; nobody else can read it.
- **One graph everywhere.** The same schema-v3 trace graph whether you run locally (direct sink) or on rickydata.org TEE infrastructure (gateway sink — your keys never enter the sandbox).
- **Toggleable.** `enabled: false` locally, or one API call remotely, turns it off completely.

## License

[AGPL-3.0](LICENSE)
