import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { log } from './log.js';

/**
 * Pending logs quiet for this long belong to sessions whose flushes never
 * completed (killed worker, backend outage, 429 halt) OR to long-idle sessions.
 * We spawn a NON-final flush for them: it re-sends idempotently (deterministic
 * graph ids; fingerprint skip makes repeats free) and never clears the log, so
 * a session resumed after a night away keeps its cumulative event history.
 * Found in production 2026-07-14: 29 of 79 quiet pending logs had never landed
 * in KFDB and nothing would ever retry them before the 30-day GC deleted them.
 */
export const RECOVER_MIN_AGE_MS = 6 * 60 * 60 * 1000;

/** Recovery spawns per dir per session-start; fingerprint-skip repeats are cheap. */
export const RECOVER_MAX_PER_START = 8;

/** Oldest-first pending logs quieter than minAgeMs, capped — the recovery set. */
export function selectQuietPendingLogs(
  dir: string,
  nowMs: number,
  minAgeMs: number = RECOVER_MIN_AGE_MS,
  cap: number = RECOVER_MAX_PER_START,
): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter((f) => f.endsWith('.jsonl'))
    .map((f) => ({ sessionId: f.slice(0, -'.jsonl'.length), mtimeMs: fs.statSync(path.join(dir, f)).mtimeMs }))
    .filter((e) => nowMs - e.mtimeMs > minAgeMs)
    .sort((a, b) => a.mtimeMs - b.mtimeMs)
    .slice(0, cap)
    .map((e) => e.sessionId);
}

/**
 * Spawn a detached NON-final flush for each quiet pending log in `dir`. The
 * flush worker owns all correctness (per-session lock, fingerprint
 * idempotency); this is just the retry trigger that dead sessions otherwise
 * never get. Fail-open: any error skips recovery, never the session.
 */
export function recoverQuietPendingLogs(dir: string, flushScriptPath: string): number {
  try {
    const quiet = selectQuietPendingLogs(dir, Date.now());
    for (const sessionId of quiet) {
      const child = spawn(process.execPath, [flushScriptPath, sessionId], {
        detached: true,
        stdio: 'ignore',
        env: process.env,
      });
      child.unref();
    }
    return quiet.length;
  } catch (err) {
    log('debug', 'pending-log recovery skipped', { error: (err as Error).message });
    return 0;
  }
}
