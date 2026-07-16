import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { HookInput } from './hook-input.js';
import { workProvenanceRefs } from './work-provenance.js';

function str(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function exactText(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined;
}

export interface RickygitArmRequest {
  event: { session_id: string; cwd?: string; source: 'startup'; objective: string; model?: string };
  env: Record<string, string>;
}

export const RICKYGIT_PREFLIGHT_DIAGNOSTIC = 'RICKYGIT_PROVENANCE_PREFLIGHT_REJECTED' as const;

export type RickygitArmResult =
  | { status: 'not_applicable' }
  | { status: 'started'; binary: string }
  | {
      status: 'rejected';
      binary: string;
      diagnosticCode: typeof RICKYGIT_PREFLIGHT_DIAGNOSTIC;
      missingFlags: string[];
      detail: string;
    };

/** Exact payload accepted by rickydata_git's idempotent session-state adapter. */
export function rickygitArmRequest(input: HookInput, env: NodeJS.ProcessEnv = process.env): RickygitArmRequest | null {
  if (input.hook_event_name !== 'UserPromptSubmit') return null;
  const objective = exactText(input.prompt);
  const sessionId = str(input.session_id);
  if (!objective || !sessionId) return null;
  const refs = workProvenanceRefs(input, env);
  const packId = str(input.context_pack_id) ?? str(input.decision_pack_id) ?? str(env.RICKYDATA_DECISION_PACK_ID);
  const packHash = str(input.context_pack_hash) ?? str(input.decision_pack_hash) ?? str(env.RICKYDATA_DECISION_PACK_HASH);
  return {
    event: {
      session_id: sessionId,
      ...(str(input.cwd) ? { cwd: str(input.cwd) } : {}),
      source: 'startup',
      objective,
      ...(str(input.model) ? { model: str(input.model) } : {}),
    },
    env: {
      RICKYDATA_OBJECTIVE: objective,
      ...(refs.sourceIntentRef ? { RICKYDATA_SOURCE_INTENT_REF: refs.sourceIntentRef } : {}),
      ...(packId && packHash ? {
        RICKYDATA_DECISION_PACK_ID: packId,
        RICKYDATA_DECISION_PACK_HASH: packHash,
      } : {}),
    },
  };
}

export function resolveRickygitSessionStartScript(env: NodeJS.ProcessEnv = process.env): string | undefined {
  const candidates = [
    str(env.RICKYGIT_SESSION_START_SCRIPT),
    path.join(os.homedir(), 'Documents/github/rickydata_git/scripts/rickygit-session-start.sh'),
  ].filter((candidate): candidate is string => Boolean(candidate));
  return candidates.find((candidate) => fs.existsSync(candidate));
}

function configuredBinary(env: NodeJS.ProcessEnv): string {
  return str(env.RICKYGIT_BIN) ?? 'rickygit';
}

/**
 * Fail closed before the detached adapter when its configured CLI cannot carry
 * every provenance ref supplied by Home. The rejection is returned to capture
 * so it becomes a durable pending/graph diagnostic rather than hidden stderr.
 */
export function preflightRickygitArm(
  request: RickygitArmRequest,
  env: NodeJS.ProcessEnv = process.env,
): Exclude<RickygitArmResult, { status: 'not_applicable' | 'started' }> | { status: 'ok'; binary: string } {
  const binary = configuredBinary(env);
  const requiredFlags = ['--source-intent-ref'];
  if (request.env.RICKYDATA_DECISION_PACK_ID || request.env.RICKYDATA_DECISION_PACK_HASH) {
    requiredFlags.push('--decision-pack-id', '--decision-pack-hash');
  }
  const help = spawnSync(binary, ['work', 'start', '--help'], {
    encoding: 'utf8',
    env,
    timeout: 1_000,
    windowsHide: true,
  });
  if (help.error || help.status !== 0) {
    return {
      status: 'rejected',
      binary,
      diagnosticCode: RICKYGIT_PREFLIGHT_DIAGNOSTIC,
      missingFlags: requiredFlags,
      detail: help.error?.message ?? `capability probe exited ${help.status ?? 'without status'}`,
    };
  }
  const output = `${help.stdout ?? ''}\n${help.stderr ?? ''}`;
  const missingFlags = requiredFlags.filter((flag) => !output.includes(flag));
  return missingFlags.length > 0
    ? {
        status: 'rejected', binary, diagnosticCode: RICKYGIT_PREFLIGHT_DIAGNOSTIC, missingFlags,
        detail: `configured rickygit cannot carry required provenance flags: ${missingFlags.join(', ')}`,
      }
    : { status: 'ok', binary };
}

/** Fire-and-forget: Git provenance may never add latency or failure to capture. */
export function spawnRickygitArm(input: HookInput, env: NodeJS.ProcessEnv = process.env): RickygitArmResult {
  const request = rickygitArmRequest(input, env);
  const script = resolveRickygitSessionStartScript(env);
  if (!request || !script) return { status: 'not_applicable' };
  const preflight = preflightRickygitArm(request, env);
  if (preflight.status === 'rejected') return preflight;
  try {
    // Capture is short-lived. A parent-owned stdin pipe can be truncated before
    // the detached adapter reads it, silently losing the arm. Put the JSON in
    // an argv slot owned by detached bash so it survives the parent lifecycle
    // without shell interpolation.
    const child = spawn('bash', [
      '-c',
      'printf %s "$1" | bash "$2"',
      'rickydata-git-arm',
      JSON.stringify(request.event),
      script,
    ], {
      detached: true,
      stdio: 'ignore',
      env: { ...env, ...request.env },
    });
    child.unref();
    return { status: 'started', binary: preflight.binary };
  } catch (error) {
    return {
      status: 'rejected',
      binary: preflight.binary,
      diagnosticCode: RICKYGIT_PREFLIGHT_DIAGNOSTIC,
      missingFlags: [],
      detail: error instanceof Error ? error.message : 'detached adapter spawn failed',
    };
  }
}
