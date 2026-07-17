---
name: execution-modes
description: Choose and verify RickyData local versus remote TEE agent execution. Use for local files/git, remote Git worktrees, Home Canvas targets, or local engine/model setup.
allowed-tools: Bash(rickydata-code:*), Bash(curl:*), Read, Grep, Glob
---

# RickyData execution modes

## Purpose

Keep execution location separate from model routing. RickyData Home exposes two execution targets; the SDK's `rickydata agents use` launcher is a hybrid integration and must not be presented as either target.

| Mode | Process and tools | Repository | Model and agent services |
|---|---|---|---|
| Remote TEE | Agent Gateway TEE | A checkout/worktree inside the TEE | RickyData Gateway |
| Local | `rickydata_code` on the user's machine | The selected local workspace, including local Git state | The provider/model selected in the local runtime |

## Verified

2026-07-17.

- `rickydata-code doctor` found the local workspace, Git, configured providers, and coding tools.
- A local app server started against `rickydata_home`; `/healthz` returned `ok`, and `get_config` reported `mode: local`, the exact Home workspace, provider, model, and execution engine.
- Agent Gateway's Canvas runtime and Git worktree test suites passed 57/57 tests, covering private authenticated worktrees, anonymous public clones, exact base commits, injected files, change collection, and cleanup.
- Home's RickyData Code client and route suites passed 32/32 tests.

## Setup / prerequisites

### Remote TEE

- Select the Home Canvas `remote` target.
- For repository work, give the TEE its own Git workspace. It cannot see a laptop filesystem or an unpushed local commit.
- Use `github_worktree` with upstream `github-repo` and `github-create-branch` nodes for an installed private repository.
- Use `github_worktree_public` with `node.data.repo`; optionally pin `node.data.baseCommit` and set `node.data.branch` for a public repository.

### Local

- Install `rickydata-code` and run Home and the app server on the same machine.
- Start the app server from the repository that should be available to agent file and Git tools, or pass its absolute path with `--workspace`.
- Configure Home with the same URL and token:

```dotenv
RICKYDATA_CODE_APP_URL=http://127.0.0.1:7899
RICKYDATA_CODE_APP_AUTH_TOKEN=local-dev-token
```

- Select the Home Canvas `local` target. Choose the provider, model, and execution engine in RickyData Code's Local Runtime settings.

## Commands

Run diagnostics from the intended local repository:

```bash
rickydata-code doctor
```

Start the verified local app-server shape from that repository:

```bash
RICKYDATA_CODE_APP_AUTH_TOKEN=local-dev-token \
  rickydata-code app --workspace "$PWD" --port 7899 --no-browser
```

In another terminal, verify the process and its resolved execution configuration:

```bash
curl -fsS http://127.0.0.1:7899/healthz

curl -fsS -X POST http://127.0.0.1:7899/rpc \
  -H 'Authorization: Bearer local-dev-token' \
  -H 'Content-Type: application/json' \
  --data '{"jsonrpc":"2.0","id":1,"method":"get_config","params":{}}'
```

Confirm that `result.mode` is `local` and `result.workspace` is the intended repository before running an agent.

## Gotchas

- **Remote run cannot see local changes:** the TEE has a separate checkout. Push the required ref/commit, or use a supported injected-file workflow.
- **Local target reports remote-only:** Home could not construct its local executor. Start the app server and make its URL/token match Home's environment.
- **Wrong repository is visible locally:** restart the app server with the intended `--workspace`; filesystem and Git tools are workspace-scoped.
- **SDK launcher is mislabeled as remote:** `rickydata agents use` starts Claude Code locally. Local filesystem/Git tools remain local, while its model requests and RickyData agent tools use Gateway services. Treat it as hybrid.

## Quick reference

- Needs current local files, dirty worktree, or local Git history: **local target + `rickydata_code`**.
- Needs isolation, hosted execution, or no local machine dependency: **remote target + TEE Git worktree**.
- Needs typed programmatic integration: **RickyData SDK**.
- Needs local Claude Code with RickyData model/agent services: **SDK hybrid launcher**.
- Needs session capture in either location: **rd-plugin**; capture does not choose the execution target.
