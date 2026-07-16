import { spawn } from 'node:child_process';
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

/** Fire-and-forget: Git provenance may never add latency or failure to capture. */
export function spawnRickygitArm(input: HookInput, env: NodeJS.ProcessEnv = process.env): boolean {
  const request = rickygitArmRequest(input, env);
  const script = resolveRickygitSessionStartScript(env);
  if (!request || !script) return false;
  try {
    const child = spawn('bash', [script], {
      detached: true,
      stdio: ['pipe', 'ignore', 'ignore'],
      env: { ...env, ...request.env },
    });
    child.stdin.end(JSON.stringify(request.event));
    child.unref();
    return true;
  } catch {
    return false;
  }
}
