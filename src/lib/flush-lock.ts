import fs from 'node:fs';
import path from 'node:path';

/**
 * Per-session flush lock. Every Stop hook spawns a detached flush; when the
 * backend is degraded a flush can run for minutes, and the next Stop spawns
 * another for the same session. Without a guard, N overlapping flushes re-send
 * the same cumulative batches N times — this was a major amplifier in the
 * 2026-07-13 KFDB overload (1,100+ flush completions in 3 minutes). The lock
 * collapses overlapping flushes to one: losers exit; their events are picked
 * up by the next Stop-hook flush. A final flush must not drop data, so it
 * waits for the holder and then proceeds regardless.
 */

/** A holder older than this is presumed hung; the lock can be taken over. */
const FLUSH_LOCK_STALE_MS = 10 * 60 * 1000;

interface FlushLockBody {
  pid?: number;
  startedAt?: number;
}

function lockPath(dir: string, sessionId: string): string {
  // Sanitize: session ids are uuids/hex, but never trust them as path parts.
  const safe = sessionId.replace(/[^A-Za-z0-9_.-]/g, '_');
  return path.join(dir, `${safe}.flush.lock`);
}

function pidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    // EPERM = alive but not ours; anything else (ESRCH) = gone.
    return (err as NodeJS.ErrnoException).code === 'EPERM';
  }
}

function holderIsLive(dir: string, sessionId: string): boolean {
  try {
    const body = JSON.parse(fs.readFileSync(lockPath(dir, sessionId), 'utf8')) as FlushLockBody;
    const fresh = typeof body.startedAt === 'number' && Date.now() - body.startedAt < FLUSH_LOCK_STALE_MS;
    const alive = typeof body.pid === 'number' && body.pid > 0 && pidAlive(body.pid);
    return fresh && alive;
  } catch {
    return false; // missing/unreadable → not a live holder
  }
}

/**
 * Try to become the single flusher for a session. Returns true when acquired
 * (including takeover of a stale/dead holder). Fail-open: on unexpected fs
 * errors it returns true — flushing twice is safer than never flushing.
 */
export function acquireFlushLock(dir: string, sessionId: string): boolean {
  const file = lockPath(dir, sessionId);
  const body = JSON.stringify({ pid: process.pid, startedAt: Date.now() });
  try {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(file, body, { flag: 'wx', mode: 0o600 });
    return true;
  } catch {
    if (holderIsLive(dir, sessionId)) return false;
    try {
      fs.writeFileSync(file, body, { mode: 0o600 });
    } catch { /* fail-open */ }
    return true;
  }
}

/**
 * Acquire for a --final flush: wait for the current holder rather than skip
 * (a skipped final flush would strand the tail of the session). If the holder
 * outlives the wait, proceed anyway — duplicate idempotent writes beat data
 * loss.
 */
export async function acquireFlushLockOrWait(dir: string, sessionId: string, maxWaitMs = 20_000): Promise<void> {
  const deadline = Date.now() + maxWaitMs;
  while (Date.now() < deadline) {
    if (acquireFlushLock(dir, sessionId)) return;
    await new Promise((r) => setTimeout(r, 500));
  }
  // Force: overwrite whatever is there so releaseFlushLock cleans up after us.
  try {
    fs.writeFileSync(lockPath(dir, sessionId), JSON.stringify({ pid: process.pid, startedAt: Date.now() }), { mode: 0o600 });
  } catch { /* fail-open */ }
}

/** Release only if we still own the lock (a stale takeover may have raced). */
export function releaseFlushLock(dir: string, sessionId: string): void {
  const file = lockPath(dir, sessionId);
  try {
    const body = JSON.parse(fs.readFileSync(file, 'utf8')) as FlushLockBody;
    if (body.pid === process.pid) fs.rmSync(file, { force: true });
  } catch { /* ignore */ }
}
