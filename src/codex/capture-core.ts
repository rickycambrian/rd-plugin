import type { HookInput } from '../lib/hook-input.js';
import { loadConfig, resolveSink, shouldTrack } from '../lib/config.js';
import { setLogLevel } from '../lib/log.js';
import { loadCodexRepoOwners } from './config.js';
import { ownedRepository, type OwnedRepository } from './repo.js';
import { toCodexPendingEvent } from './event.js';
import { appendCodexPending, codexPendingCount } from './pending.js';
import { codexPendingFileFor } from './paths.js';
import {
  spawnRickygitArm, spawnRickygitSessionCapture, type RickygitArmResult, type RickygitSessionCaptureResult,
} from '../lib/rickygit-arm.js';

export interface CodexCaptureResult {
  codexSessionId: string;
  /** True when this event is a turn Stop → the caller spawns the detached flush. */
  shouldFlush: boolean;
}

type RepoResolver = (cwd: string | undefined, owners: string[] | null) => Promise<OwnedRepository | null>;
type GitArm = (input: HookInput, env: NodeJS.ProcessEnv) => RickygitArmResult;
type GitClose = (input: HookInput, transcriptPath: string, env: NodeJS.ProcessEnv) => RickygitSessionCaptureResult;

/**
 * Codex capture core: gate on sink/kill-switch/excluded-dir and the owned-repo
 * allowlist, then append exactly one normalized event to the session's pending
 * log. Returns null when nothing was captured (sink off, untracked cwd, or the
 * cwd is not an owned GitHub repo). No network here — the fast hot path.
 *
 * `resolveRepo` is injectable for tests; production uses the git-backed
 * `ownedRepository`.
 */
export async function runCodexCapture(
  input: HookInput,
  env: NodeJS.ProcessEnv = process.env,
  resolveRepo: RepoResolver = ownedRepository,
  armGit: GitArm = spawnRickygitArm,
  closeGit: GitClose = spawnRickygitSessionCapture,
): Promise<CodexCaptureResult | null> {
  const config = loadConfig();
  setLogLevel(config.log_level);

  const sink = resolveSink(config, env);
  if (sink === 'off' || !shouldTrack(config, typeof input.cwd === 'string' ? input.cwd : undefined)) {
    return null;
  }

  const repo = await resolveRepo(typeof input.cwd === 'string' ? input.cwd : undefined, loadCodexRepoOwners());
  if (!repo) return null;

  const codexSessionId = typeof input.session_id === 'string' && input.session_id ? input.session_id : 'unknown';
  const sequence = codexPendingCount(codexSessionId);
  const event = toCodexPendingEvent(input, sequence, repo);
  const gitEnv = {
    ...env,
    RICKYDATA_AGENT_ID: env.RICKYDATA_AGENT_ID || 'agent:ricky-codex',
    RICKYDATA_HARNESS: 'codex',
    RICKYDATA_SESSION_FORMAT: 'codex-hooks.jsonl.v1',
    RICKYDATA_AUTO_INIT: 'true',
  };
  if (event.hookEventName === 'UserPromptSubmit') {
    const gitArm = armGit(input, gitEnv);
    if (gitArm.status === 'started') {
      event.workProvenance!.gitArm = { status: 'started', binary: gitArm.binary };
    } else if (gitArm.status === 'rejected') {
      event.workProvenance!.gitArm = {
        status: 'rejected', binary: gitArm.binary, diagnosticCode: gitArm.diagnosticCode,
        missingFlags: gitArm.missingFlags, detail: gitArm.detail,
      };
    }
  }
  appendCodexPending(codexSessionId, event);
  if (event.hookEventName === 'Stop') {
    closeGit(input, codexPendingFileFor(codexSessionId), gitEnv);
  }

  return { codexSessionId, shouldFlush: event.hookEventName === 'Stop' };
}
