import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildCodexHookTraceOperations } from 'rickydata/kfdb';
import { CONFIG_FILE } from '../src/lib/paths.js';
import { buildCodexTraces, groupTurns } from '../src/codex/trace.js';
import { buildCodexGraphOperations, extractCodexSessionNodeId } from '../src/codex/graph.js';
import { writeCodexSpool, codexSpoolFileName } from '../src/codex/spool.js';
import { loadCodexRepoOwners, RD_CODEX_AGENT_ID } from '../src/codex/config.js';
import { parseGitHubRemote, ownedRepository } from '../src/codex/repo.js';
import { runCodexCapture } from '../src/codex/capture-core.js';
import { readCodexPending } from '../src/codex/pending.js';
import type { CodexPendingEvent } from '../src/codex/event.js';
import type { HookInput } from '../src/lib/hook-input.js';

const WALLET = '0xb3e6fa9620933ba9a6037f4ff890ec5fad0ba113';
const AGENT = 'codex';

type Op = Record<string, any>;

const tmpDirs: string[] = [];
function tmp(): string {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'rd-plugin-codex-'));
  tmpDirs.push(d);
  return d;
}
afterEach(() => {
  for (const d of tmpDirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
  try { fs.rmSync(CONFIG_FILE, { force: true }); } catch { /* ignore */ }
});

/** A two-turn Codex event stream with a file read (CodeFile) and a command (CodeCommand). */
function codexEvents(codexSessionId = 'cx-session-1'): CodexPendingEvent[] {
  return [
    { sequence: 0, hookEventName: 'UserPromptSubmit', codexSessionId, turnId: 't1', model: 'gpt-5.3-codex', cwd: '/repo', receivedAt: 1_700_000_000_000, prompt: 'do a thing' },
    { sequence: 1, hookEventName: 'PostToolUse', codexSessionId, turnId: 't1', cwd: '/repo', receivedAt: 1_700_000_000_100, toolName: 'Read', toolUseId: 'u1', toolInput: { file_path: '/repo/src/x.ts' }, toolResponse: { ok: true } },
    { sequence: 2, hookEventName: 'Stop', codexSessionId, turnId: 't1', cwd: '/repo', receivedAt: 1_700_000_000_200, lastAssistantMessage: 'done' },
    { sequence: 3, hookEventName: 'UserPromptSubmit', codexSessionId, turnId: 't2', cwd: '/repo', receivedAt: 1_700_000_000_300, prompt: 'run it' },
    { sequence: 4, hookEventName: 'PostToolUse', codexSessionId, turnId: 't2', cwd: '/repo', receivedAt: 1_700_000_000_400, toolName: 'Bash', toolUseId: 'u2', toolInput: { command: 'ls -la' }, toolResponse: { ok: true } },
    { sequence: 5, hookEventName: 'Stop', codexSessionId, turnId: 't2', cwd: '/repo', receivedAt: 1_700_000_000_500, lastAssistantMessage: 'ran' },
  ] as CodexPendingEvent[];
}

function traces(codexSessionId = 'cx-session-1') {
  return buildCodexTraces({ walletAddress: WALLET, agentId: AGENT, codexSessionId, events: codexEvents(codexSessionId) });
}

describe('codex trace grouping', () => {
  it('groups events into one turn per turnId', () => {
    const groups = groupTurns(codexEvents());
    expect(groups.map((g) => g.turnId)).toEqual(['t1', 't2']);
    expect(groups.map((g) => g.events.length)).toEqual([3, 3]);
  });

  it('synthesizes a stable turnId when events carry none', () => {
    const events = [
      { sequence: 0, hookEventName: 'UserPromptSubmit', codexSessionId: 'cx', receivedAt: 1, prompt: 'hi' },
      { sequence: 1, hookEventName: 'Stop', codexSessionId: 'cx', receivedAt: 2 },
    ] as CodexPendingEvent[];
    const t = buildCodexTraces({ walletAddress: WALLET, agentId: AGENT, codexSessionId: 'cx', events });
    expect(t).toHaveLength(1);
    expect(t[0].turnId).toBe('cx-turn-1');
  });

  it('builds one trace per turn with session/turn scalars', () => {
    const t = traces();
    expect(t).toHaveLength(2);
    expect(t[0]).toMatchObject({ walletAddress: WALLET, agentId: AGENT, sessionId: 'cx-session-1', codexSessionId: 'cx-session-1', turnIndex: 1, turnId: 't1', model: 'gpt-5.3-codex', cwd: '/repo' });
    expect(t[1].model).toBe('gpt-5.3-codex'); // session-wide fallback for a turn with no model event
  });
});

describe('codex graph operations', () => {
  it('emits exactly one CodexSession create_node per trace and extracts its id', () => {
    for (const trace of traces()) {
      const ops = buildCodexHookTraceOperations(trace) as Op[];
      const sessionNodes = ops.filter((o) => o.operation === 'create_node' && o.label === 'CodexSession');
      expect(sessionNodes).toHaveLength(1);
      expect(extractCodexSessionNodeId(ops)).toBe(sessionNodes[0].id);
    }
  });

  it('links each session into the SAME_SESSION star keyed on codexSessionId', () => {
    const ops = buildCodexGraphOperations(WALLET, traces()) as Op[];
    const sessionNode = ops.find((o) => o.operation === 'create_node' && o.label === 'CodexSession') as Op;
    const key = ops.find((o) => o.operation === 'create_node' && o.label === 'HarnessSessionKey') as Op;
    const edge = ops.find((o) => o.operation === 'create_edge' && o.edge_type === 'SAME_SESSION') as Op;
    expect(key.properties.claude_session_id.String).toBe('cx-session-1');
    expect(edge.from).toBe(sessionNode.id);
    expect(edge.to).toBe(key.id);
    expect(edge.properties.from_label.String).toBe('CodexSession');
  });

  it('omits `source` on shared code nodes (CodeFile/CodeCommand/CodeWorkspace)', () => {
    const ops = buildCodexGraphOperations(WALLET, traces()) as Op[];
    const shared = ops.filter((o) => o.operation === 'create_node' && ['CodeFile', 'CodeCommand', 'CodeWorkspace'].includes(o.label));
    // All three shared-code labels must actually be present, or the test is vacuous.
    expect(new Set(shared.map((o) => o.label))).toEqual(new Set(['CodeFile', 'CodeCommand', 'CodeWorkspace']));
    for (const node of shared) {
      expect('source' in node.properties).toBe(false);
    }
  });

  it('is deterministic: identical ops across repeated builds of the same input', () => {
    const a = JSON.stringify(buildCodexGraphOperations(WALLET, traces()));
    const b = JSON.stringify(buildCodexGraphOperations(WALLET, traces()));
    expect(a).toBe(b);
  });
});

describe('codex direct/gateway parity', () => {
  it('gateway spool graphOperations concat equals the direct-sink ops', () => {
    const t = traces();
    const directOps = buildCodexGraphOperations(WALLET, t);

    const dir = tmp();
    const files = writeCodexSpool(dir, t);
    expect(files).toHaveLength(2);

    const bodies = files
      .map((f) => JSON.parse(fs.readFileSync(f, 'utf8')))
      .sort((a, b) => a.turnIndex - b.turnIndex);
    for (const body of bodies) {
      expect(body.spoolVersion).toBe(2);
      expect(body.codexSessionId).toBe('cx-session-1');
    }
    const spoolOps = bodies.flatMap((b) => b.graphOperations);
    expect(spoolOps).toEqual(directOps);
  });

  it('names spool files with the codex- prefix and -bN split suffix', () => {
    expect(codexSpoolFileName('cx', 1)).toBe('codex-trace-cx-1.json');
    expect(codexSpoolFileName('cx', 3, 2)).toBe('codex-trace-cx-3-b2.json');
  });
});

describe('codex config', () => {
  it('disables the owner gate when codex_repo_owners is unset, lowercases configured lists, and treats "*" as gate-off', () => {
    expect(loadCodexRepoOwners()).toBeNull();
    fs.mkdirSync(path.dirname(CONFIG_FILE), { recursive: true });
    fs.writeFileSync(CONFIG_FILE, JSON.stringify({ codex_repo_owners: ['MyOrg', 'Other'] }));
    expect(loadCodexRepoOwners()).toEqual(['myorg', 'other']);
    fs.writeFileSync(CONFIG_FILE, JSON.stringify({ codex_repo_owners: ['*'] }));
    expect(loadCodexRepoOwners()).toBeNull();
    fs.writeFileSync(CONFIG_FILE, JSON.stringify({ codex_repo_owners: [] }));
    expect(loadCodexRepoOwners()).toBeNull();
  });

  it('defaults the codex agent id to `codex`', () => {
    expect(RD_CODEX_AGENT_ID).toBe('codex');
  });

  it('resolves any GitHub repo when the owner gate is off (owners=null) and still gates on a configured list', async () => {
    const cwd = process.cwd(); // this repo: github.com/rickycambrian/rd-plugin
    const gateOff = await ownedRepository(cwd, null);
    expect(gateOff?.owner).toBe('rickycambrian');
    expect(gateOff?.repository).toBe('rd-plugin');
    expect(await ownedRepository(cwd, ['someoneelse'])).toBeNull();
  });

  it('parses scp and https GitHub remotes', () => {
    expect(parseGitHubRemote('git@github.com:rickycambrian/rd-plugin.git')).toEqual({ owner: 'rickycambrian', repository: 'rd-plugin' });
    expect(parseGitHubRemote('https://github.com/rickycambrian/rd-plugin')).toEqual({ owner: 'rickycambrian', repository: 'rd-plugin' });
    expect(parseGitHubRemote('git@gitlab.com:x/y.git')).toBeNull();
  });
});

describe('codex capture owner-gate', () => {
  const directEnv = { RICKYDATA_KG_SINK: 'direct' } as unknown as NodeJS.ProcessEnv;
  const owned = async () => ({ owner: 'rickycambrian', repository: 'rd-plugin', remoteUrl: 'git@github.com:rickycambrian/rd-plugin.git' });
  const notOwned = async () => null;

  function input(overrides: Partial<HookInput>): HookInput {
    return { session_id: 'cx-cap', cwd: '/repo', hook_event_name: 'UserPromptSubmit', ...overrides };
  }

  it('appends and flags flush on a Stop for an owned repo', async () => {
    const sid = 'cx-cap-stop';
    const res = await runCodexCapture(input({ session_id: sid, hook_event_name: 'Stop' }), directEnv, owned);
    expect(res).toEqual({ codexSessionId: sid, shouldFlush: true });
    expect(readCodexPending(sid)).toHaveLength(1);
  });

  it('appends without flush on a non-Stop event', async () => {
    const sid = 'cx-cap-prompt';
    const res = await runCodexCapture(input({ session_id: sid, prompt: 'hi' }), directEnv, owned);
    expect(res).toEqual({ codexSessionId: sid, shouldFlush: false });
    expect(readCodexPending(sid)).toHaveLength(1);
  });

  it('captures nothing for a non-owned repo', async () => {
    const sid = 'cx-cap-foreign';
    const res = await runCodexCapture(input({ session_id: sid, hook_event_name: 'Stop' }), directEnv, notOwned);
    expect(res).toBeNull();
    expect(readCodexPending(sid)).toHaveLength(0);
  });

  it('captures nothing when the sink is off', async () => {
    const sid = 'cx-cap-off';
    const offEnv = { RICKYDATA_KG_SINK: 'off' } as unknown as NodeJS.ProcessEnv;
    const res = await runCodexCapture(input({ session_id: sid, hook_event_name: 'Stop' }), offEnv, owned);
    expect(res).toBeNull();
    expect(readCodexPending(sid)).toHaveLength(0);
  });
});
