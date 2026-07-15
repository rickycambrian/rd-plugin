import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { log } from './log.js';
import { readState, type FlushedEntry } from './state.js';

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

/**
 * A log needs recovery when events arrived after the last recorded flush (or
 * there is no record at all). Comparing mtime to the entry's updatedAt is what
 * lets the capped sweep make progress: already-recovered logs drop out of
 * selection instead of hogging the oldest-N slots forever — a non-final flush
 * clears neither the file nor its mtime, so pure oldest-first re-selected the
 * same flushed logs on every start and never reached the unflushed tail
 * (found in production 2026-07-15: 58 unflushed logs stuck at ranks 12+).
 */
export function needsRecovery(mtimeMs: number, entry: FlushedEntry | undefined): boolean {
  if (!entry) return true;
  const flushedAt = Date.parse(entry.updatedAt ?? '');
  return !Number.isFinite(flushedAt) || mtimeMs > flushedAt;
}

/** Oldest-first pending logs quieter than minAgeMs with no post-events flush record, capped. */
export function selectQuietPendingLogs(
  dir: string,
  nowMs: number,
  flushed: Record<string, FlushedEntry> = {},
  minAgeMs: number = RECOVER_MIN_AGE_MS,
  cap: number = RECOVER_MAX_PER_START,
): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter((f) => f.endsWith('.jsonl'))
    .map((f) => ({ sessionId: f.slice(0, -'.jsonl'.length), mtimeMs: fs.statSync(path.join(dir, f)).mtimeMs }))
    .filter((e) => nowMs - e.mtimeMs > minAgeMs && needsRecovery(e.mtimeMs, flushed[e.sessionId]))
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
    const quiet = selectQuietPendingLogs(dir, Date.now(), readState().flushed);
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
