import type { HookInput } from '../lib/hook-input.js';
import { loadConfig, resolveSink, shouldTrack } from '../lib/config.js';
import { setLogLevel } from '../lib/log.js';
import { loadCodexRepoOwners } from './config.js';
import { ownedRepository, type OwnedRepository } from './repo.js';
import { toCodexPendingEvent } from './event.js';
import { appendCodexPending, codexPendingCount } from './pending.js';

export interface CodexCaptureResult {
  codexSessionId: string;
  /** True when this event is a turn Stop → the caller spawns the detached flush. */
  shouldFlush: boolean;
}

type RepoResolver = (cwd: string | undefined, owners: string[] | null) => Promise<OwnedRepository | null>;

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
  appendCodexPending(codexSessionId, event);

  return { codexSessionId, shouldFlush: event.hookEventName === 'Stop' };
}
