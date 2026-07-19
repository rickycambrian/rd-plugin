/**
 * CI-wait guard core — the pure law behind the PreToolUse hook that turns the
 * evo-optimized CiWaitPolicyV1 into live denials.
 *
 * The poll classifier and the budget law are verbatim ports of rickydata_home
 * src/sessions/telemetry.ts POLL_PATTERNS and src/ciwait/{policy,simulate}.ts
 * deniesAt — the SAME rules the TRAIN/holdout evaluation ran on. Any drift
 * here silently invalidates the experiment; change home first, port second.
 *
 * FAIL-OPEN is the prime directive: no policy file, malformed policy, state
 * I/O failure, kill-switch, anything unexpected → allow, emit nothing.
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

/** Verbatim from home telemetry.ts (the classes the hand-scan proved). */
const POLL_PATTERNS: ReadonlyArray<{ cls: string; re: RegExp }> = [
  { cls: 'gh-run-watch', re: /gh\s+run\s+watch/ },
  { cls: 'gh-run-view', re: /gh\s+run\s+view/ },
  { cls: 'gh-run-list', re: /gh\s+run\s+list/ },
  { cls: 'gh-pr-checks', re: /gh\s+pr\s+checks/ },
];

export function pollClassOf(command: string): string | null {
  for (const { cls, re } of POLL_PATTERNS) {
    if (re.test(command)) return cls;
  }
  return null;
}

export interface CiWaitPolicyV1 {
  version: 1;
  budgetPerSession: number;
  perClassBudget?: Record<string, number>;
  guidance: string;
}

/** Strict mirror of home validateCiWaitPolicy (unknown fields reject). */
export function validateCiWaitPolicy(json: unknown): CiWaitPolicyV1 | null {
  if (typeof json !== 'object' || json === null || Array.isArray(json)) return null;
  const r = json as Record<string, unknown>;
  const known = new Set(['version', 'budgetPerSession', 'perClassBudget', 'guidance']);
  for (const key of Object.keys(r)) if (!known.has(key)) return null;
  if (r['version'] !== 1) return null;
  const budget = r['budgetPerSession'];
  if (typeof budget !== 'number' || !Number.isInteger(budget) || budget < 1) return null;
  const guidance = r['guidance'];
  if (typeof guidance !== 'string' || guidance.trim() === '' || guidance.length > 2_000) return null;
  const policy: CiWaitPolicyV1 = { version: 1, budgetPerSession: budget, guidance };
  if (r['perClassBudget'] !== undefined) {
    const pcb = r['perClassBudget'];
    if (typeof pcb !== 'object' || pcb === null || Array.isArray(pcb)) return null;
    const perClass: Record<string, number> = {};
    for (const [cls, v] of Object.entries(pcb as Record<string, unknown>)) {
      if (typeof v !== 'number' || !Number.isInteger(v) || v < 0) return null;
      perClass[cls] = v;
    }
    policy.perClassBudget = perClass;
  }
  return policy;
}

export interface CiWaitSessionState {
  /** Polls ALLOWED so far (denied attempts do not consume budget). */
  polls: number;
  perClass: Record<string, number>;
  denials: number;
}

export const EMPTY_CI_WAIT_STATE: CiWaitSessionState = { polls: 0, perClass: {}, denials: 0 };

/**
 * The budget law — same shape as home simulate.ts deniesAt. `polls` counts
 * allowed polls this session; the first poll is always allowed.
 */
export function ciWaitDenies(policy: CiWaitPolicyV1, cls: string, state: CiWaitSessionState): boolean {
  if (state.polls === 0) return false; // first check is always legitimate
  if (state.polls >= policy.budgetPerSession) return true;
  const classBudget = policy.perClassBudget?.[cls];
  if (classBudget !== undefined && (state.perClass[cls] ?? 0) >= classBudget) return true;
  return false;
}

export type CiWaitDecision =
  | { action: 'allow'; cls: string | null; state: CiWaitSessionState }
  | { action: 'deny'; cls: string; reason: string; state: CiWaitSessionState };

/** Pure decision + next state for one Bash command. */
export function decideCiWait(
  command: string,
  policy: CiWaitPolicyV1,
  state: CiWaitSessionState,
): CiWaitDecision {
  const cls = pollClassOf(command);
  if (!cls) return { action: 'allow', cls: null, state };
  if (ciWaitDenies(policy, cls, state)) {
    return { action: 'deny', cls, reason: policy.guidance, state: { ...state, denials: state.denials + 1 } };
  }
  return {
    action: 'allow',
    cls,
    state: {
      polls: state.polls + 1,
      perClass: { ...state.perClass, [cls]: (state.perClass[cls] ?? 0) + 1 },
      denials: state.denials,
    },
  };
}

// ── filesystem plumbing (all fail-open; callers swallow throws) ──────────────

export function ciWaitDir(): string {
  return process.env['CI_WAIT_DIR'] || path.join(os.homedir(), '.rickydata', 'ci-wait');
}

export function loadCiWaitPolicy(): CiWaitPolicyV1 | null {
  try {
    const p = process.env['CI_WAIT_POLICY_PATH'] || path.join(ciWaitDir(), 'policy.json');
    return validateCiWaitPolicy(JSON.parse(fs.readFileSync(p, 'utf8')));
  } catch {
    return null;
  }
}

const safeSessionFile = (sessionId: string): string | null => {
  if (!/^[A-Za-z0-9._-]{1,128}$/.test(sessionId)) return null;
  return path.join(ciWaitDir(), 'state', `${sessionId}.json`);
};

export function loadCiWaitState(sessionId: string): CiWaitSessionState {
  try {
    const p = safeSessionFile(sessionId);
    if (!p) return { ...EMPTY_CI_WAIT_STATE, perClass: {} };
    const raw = JSON.parse(fs.readFileSync(p, 'utf8')) as Record<string, unknown>;
    const polls = typeof raw['polls'] === 'number' ? raw['polls'] : 0;
    const denials = typeof raw['denials'] === 'number' ? raw['denials'] : 0;
    const perClass: Record<string, number> = {};
    if (typeof raw['perClass'] === 'object' && raw['perClass'] !== null) {
      for (const [k, v] of Object.entries(raw['perClass'] as Record<string, unknown>)) {
        if (typeof v === 'number') perClass[k] = v;
      }
    }
    return { polls, perClass, denials };
  } catch {
    return { polls: 0, perClass: {}, denials: 0 };
  }
}

export function saveCiWaitState(sessionId: string, state: CiWaitSessionState): void {
  const p = safeSessionFile(sessionId);
  if (!p) return;
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(state));
}

/** Mechanism-evidence ledger the live-effect report reads. */
export function appendCiWaitDenial(sessionId: string, cls: string, state: CiWaitSessionState): void {
  const line = JSON.stringify({ ts: new Date().toISOString(), sessionId, cls, polls: state.polls, denials: state.denials });
  fs.mkdirSync(ciWaitDir(), { recursive: true });
  fs.appendFileSync(path.join(ciWaitDir(), 'denials.jsonl'), line + '\n');
}
