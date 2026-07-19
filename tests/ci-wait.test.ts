import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import {
  EMPTY_CI_WAIT_STATE,
  decideCiWait,
  loadCiWaitPolicy,
  loadCiWaitState,
  pollClassOf,
  saveCiWaitState,
  validateCiWaitPolicy,
  type CiWaitPolicyV1,
} from '../src/lib/ci-wait.js';

const POLICY: CiWaitPolicyV1 = { version: 1, budgetPerSession: 2, guidance: 'use gh run watch --exit-status in background' };

describe('poll classification (verbatim home POLL_PATTERNS port)', () => {
  it('matches the four classes and nothing else', () => {
    expect(pollClassOf('gh run watch 12')).toBe('gh-run-watch');
    expect(pollClassOf('gh run view 12 --log')).toBe('gh-run-view');
    expect(pollClassOf('gh run list -L3')).toBe('gh-run-list');
    expect(pollClassOf('gh pr checks 4')).toBe('gh-pr-checks');
    expect(pollClassOf('gh pr view 4')).toBeNull();
    expect(pollClassOf('npm test')).toBeNull();
  });
});

describe('decideCiWait (budget law)', () => {
  it('always allows the first poll, denies past the budget, and denied polls do not consume budget', () => {
    let state = EMPTY_CI_WAIT_STATE;
    const d1 = decideCiWait('gh run view 1', POLICY, state);
    expect(d1.action).toBe('allow');
    state = d1.state;
    const d2 = decideCiWait('gh run view 1', POLICY, state);
    expect(d2.action).toBe('allow');
    state = d2.state;
    const d3 = decideCiWait('gh run view 1', POLICY, state);
    expect(d3).toMatchObject({ action: 'deny', cls: 'gh-run-view', reason: POLICY.guidance });
    // Denial recorded, budget unchanged → a 4th attempt is still denied.
    const d4 = decideCiWait('gh pr checks 1', POLICY, d3.state);
    expect(d4.action).toBe('deny');
    expect(d4.state.denials).toBe(2);
  });

  it('non-poll commands pass through untouched', () => {
    const d = decideCiWait('git status', POLICY, EMPTY_CI_WAIT_STATE);
    expect(d).toEqual({ action: 'allow', cls: null, state: EMPTY_CI_WAIT_STATE });
  });

  it('per-class budgets bind tighter than the session budget', () => {
    const p: CiWaitPolicyV1 = { ...POLICY, budgetPerSession: 10, perClassBudget: { 'gh-run-list': 1 } };
    let state = decideCiWait('gh run list', p, EMPTY_CI_WAIT_STATE).state;
    expect(decideCiWait('gh run list', p, state).action).toBe('deny');
    expect(decideCiWait('gh run watch 1', p, state).action).toBe('allow');
  });
});

describe('policy + state files (fail-open plumbing)', () => {
  let dir: string;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ci-wait-'));
    process.env['CI_WAIT_DIR'] = dir;
    delete process.env['CI_WAIT_POLICY_PATH'];
  });
  afterEach(() => {
    delete process.env['CI_WAIT_DIR'];
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('loadCiWaitPolicy is null (dormant) on missing/malformed/unknown-field policy', () => {
    expect(loadCiWaitPolicy()).toBeNull();
    fs.writeFileSync(path.join(dir, 'policy.json'), 'not json');
    expect(loadCiWaitPolicy()).toBeNull();
    fs.writeFileSync(path.join(dir, 'policy.json'), JSON.stringify({ ...POLICY, extra: 1 }));
    expect(loadCiWaitPolicy()).toBeNull();
    fs.writeFileSync(path.join(dir, 'policy.json'), JSON.stringify(POLICY));
    expect(loadCiWaitPolicy()).toEqual(POLICY);
  });

  it('state round-trips per session and defaults to empty on garbage', () => {
    saveCiWaitState('sess-1', { polls: 3, perClass: { 'gh-run-view': 3 }, denials: 1 });
    expect(loadCiWaitState('sess-1')).toEqual({ polls: 3, perClass: { 'gh-run-view': 3 }, denials: 1 });
    expect(loadCiWaitState('sess-2')).toEqual({ polls: 0, perClass: {}, denials: 0 });
    expect(loadCiWaitState('../evil')).toEqual({ polls: 0, perClass: {}, denials: 0 });
  });

  it('validateCiWaitPolicy rejects the malformed shapes', () => {
    expect(validateCiWaitPolicy({ ...POLICY, budgetPerSession: 0 })).toBeNull();
    expect(validateCiWaitPolicy({ ...POLICY, guidance: '' })).toBeNull();
    expect(validateCiWaitPolicy({ ...POLICY, perClassBudget: { x: -1 } })).toBeNull();
    expect(validateCiWaitPolicy(null)).toBeNull();
  });
});

describe('built hook end-to-end (dist/ci-wait-guard.mjs)', () => {
  const distHook = path.resolve(__dirname, '..', 'dist', 'ci-wait-guard.mjs');
  const run = (stdin: string, env: Record<string, string>): string =>
    execFileSync(process.execPath, [distHook], {
      input: stdin,
      env: { ...process.env, ...env },
      encoding: 'utf8',
    });

  let dir: string;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ci-wait-e2e-'));
    fs.writeFileSync(path.join(dir, 'policy.json'), JSON.stringify(POLICY));
  });
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  const event = (command: string): string =>
    JSON.stringify({ hook_event_name: 'PreToolUse', tool_name: 'Bash', session_id: 'e2e-1', tool_input: { command } });

  it.skipIf(!fs.existsSync(distHook))('allows within budget, denies past it, and logs the denial', () => {
    const env = { CI_WAIT_DIR: dir };
    expect(run(event('gh run view 9'), env)).toBe('');
    expect(run(event('gh run view 9'), env)).toBe('');
    const out = run(event('gh run view 9'), env);
    expect(JSON.parse(out)).toEqual({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason: POLICY.guidance,
      },
    });
    const log = fs.readFileSync(path.join(dir, 'denials.jsonl'), 'utf8').trim().split('\n');
    expect(log).toHaveLength(1);
    expect(JSON.parse(log[0]!)).toMatchObject({ sessionId: 'e2e-1', cls: 'gh-run-view' });
  });

  it.skipIf(!fs.existsSync(distHook))('fails open: kill-switch, no policy, garbage stdin', () => {
    expect(run(event('gh run view 9'), { CI_WAIT_DIR: dir, CI_WAIT_GUARD: '0' })).toBe('');
    const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'ci-wait-none-'));
    expect(run(event('gh run view 9'), { CI_WAIT_DIR: empty })).toBe('');
    expect(run('garbage', { CI_WAIT_DIR: dir })).toBe('');
    fs.rmSync(empty, { recursive: true, force: true });
  });
});
