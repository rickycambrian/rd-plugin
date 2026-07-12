# rd-plugin e2e verification gate

Scripts backing SPEC-006 (final verification gate). Lead-run only, against
production KFDB (`http://34.60.37.158`) for the gate wallet
`0xb3e6fa9620933ba9a6037f4ff890ec5fad0ba113`.

## Dependency

Run **from the repo root** — these import `rickydata/kfdb`, which resolves to
`rickydata@1.11.0` (already a root `dependency` in `package.json`). No extra
install is needed. `ethers` is only pulled in as a fallback when there is no
usable `~/.rickydata/derive-session.json`; with a live derive-session cache the
scripts need no signing library.

## Read model (why not KQL for the assertions)

Wallet-scoped trace nodes are S2D-encrypted and are **invisible to
`/api/v1/kql`** (it returns 0 for them). All wallet-scoped assertions therefore
read through the SDK private-scope direct-read path in `kg.mjs`
(`batchGetEntities` / `listEntities` with `scope:'private'`), using the plugin's
cached derive session. `kql.mjs` remains only for genuinely global (unencrypted)
queries.

Node ids are deterministic from `(wallet, agentId, claudeSessionId)` — so a
proof can fetch the exact expected `ClaudeCodeSession` / `HarnessSessionKey`
nodes by id and assert presence (or, for toggle-off, absence) without scanning.

## Files

| Script | Step | Input |
|---|---|---|
| `kg.mjs` | shared private-scope read helper (client, node-ids, in-degree) | — |
| `kql.mjs` | shared KQL helper (global/unencrypted data only) | — |
| `local-proof.mjs` | 1 — local direct-sink | `--session-id <uuid>` (real session) or `--synthetic` |
| `remote-proof.mjs` | 2 — remote gateway-sink | `--session-id <uuid>` |
| `full-gate.mjs` | 3 parity, 4 in-degree, orchestrates 1/2/5, emits proof | `--local/-remote/-toggle-session-id` |
| `toggle-proof.mjs` | 5 — toggle-off zero-writes (asserts node ids ABSENT) | `--session-id <uuid>` |

## Run

```bash
# each step, with a real session id from a live run
node scripts/e2e/local-proof.mjs  --session-id <local-sid>
node scripts/e2e/remote-proof.mjs --session-id <remote-sid>
node scripts/e2e/toggle-proof.mjs --session-id <disabled-run-sid>

# full gate (writes proof-<date>.json at repo root)
node scripts/e2e/full-gate.mjs \
  --local-session-id <local-sid> \
  --remote-session-id <remote-sid> \
  --toggle-session-id <disabled-run-sid>

# quick look at one session's nodes
node scripts/e2e/kg.mjs <claude-session-uuid>
```

Every script prints a JSON result and exits non-zero on failure. Missing a
required `--session-id` yields a clean `pass:false` with a reason (no fabricated
pass).
