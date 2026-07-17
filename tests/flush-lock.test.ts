import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { acquireFlushLock, acquireFlushLockOrWait, releaseFlushLock } from '../src/lib/flush-lock.js';

let dir: string;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rd-flush-lock-'));
});

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

function lockFile(sessionId: string): string {
  return path.join(dir, `${sessionId}.flush.lock`);
}

describe('acquireFlushLock', () => {
  it('acquires when no lock exists and writes pid + startedAt', () => {
    expect(acquireFlushLock(dir, 'sess-a')).toBe(true);
    const body = JSON.parse(fs.readFileSync(lockFile('sess-a'), 'utf8'));
    expect(body.pid).toBe(process.pid);
    expect(typeof body.startedAt).toBe('number');
  });

  it('refuses when a live fresh holder exists', () => {
    // Our own pid is definitionally alive.
    fs.writeFileSync(lockFile('sess-a'), JSON.stringify({ pid: process.pid, startedAt: Date.now() }));
    expect(acquireFlushLock(dir, 'sess-a')).toBe(false);
  });

  it('is per-session: a lock on one session does not block another', () => {
    expect(acquireFlushLock(dir, 'sess-a')).toBe(true);
    expect(acquireFlushLock(dir, 'sess-b')).toBe(true);
  });

  it('does not take over an old lock while its holder is still alive', () => {
    fs.writeFileSync(lockFile('sess-a'), JSON.stringify({ pid: process.pid, startedAt: Date.now() - 11 * 60 * 1000 }));
    expect(acquireFlushLock(dir, 'sess-a')).toBe(false);
    const body = JSON.parse(fs.readFileSync(lockFile('sess-a'), 'utf8'));
    expect(body.startedAt).toBeLessThan(Date.now() - 10 * 60 * 1000);
    expect(body.pid).toBe(process.pid);
  });

  it('takes over a dead holder', () => {
    // PID from a range that cannot be a live process we own (max pid + reuse
    // is theoretically possible but 2^22 exceeds default pid_max on darwin).
    fs.writeFileSync(lockFile('sess-a'), JSON.stringify({ pid: 4_194_304, startedAt: Date.now() }));
    expect(acquireFlushLock(dir, 'sess-a')).toBe(true);
  });

  it('takes over an unreadable lock file', () => {
    fs.writeFileSync(lockFile('sess-a'), 'not json');
    expect(acquireFlushLock(dir, 'sess-a')).toBe(true);
  });

  it('sanitizes hostile session ids into the lock filename', () => {
    expect(acquireFlushLock(dir, '../../evil')).toBe(true);
    expect(fs.existsSync(path.join(dir, '.._.._evil.flush.lock'))).toBe(true);
  });
});

describe('releaseFlushLock', () => {
  it('removes a lock we own', () => {
    acquireFlushLock(dir, 'sess-a');
    releaseFlushLock(dir, 'sess-a');
    expect(fs.existsSync(lockFile('sess-a'))).toBe(false);
  });

  it('leaves a lock owned by another pid', () => {
    fs.writeFileSync(lockFile('sess-a'), JSON.stringify({ pid: process.pid + 1, startedAt: Date.now() }));
    releaseFlushLock(dir, 'sess-a');
    expect(fs.existsSync(lockFile('sess-a'))).toBe(true);
  });

  it('is a no-op when no lock exists', () => {
    expect(() => releaseFlushLock(dir, 'sess-a')).not.toThrow();
  });
});

describe('acquireFlushLockOrWait', () => {
  it('returns immediately when the lock is free', async () => {
    const t0 = Date.now();
    await acquireFlushLockOrWait(dir, 'sess-a', 5000);
    expect(Date.now() - t0).toBeLessThan(400);
    const body = JSON.parse(fs.readFileSync(lockFile('sess-a'), 'utf8'));
    expect(body.pid).toBe(process.pid);
  });

  it('waits for a live holder, then forces the lock at the deadline', async () => {
    fs.writeFileSync(lockFile('sess-a'), JSON.stringify({ pid: process.pid, startedAt: Date.now() }));
    const t0 = Date.now();
    await acquireFlushLockOrWait(dir, 'sess-a', 1200);
    expect(Date.now() - t0).toBeGreaterThanOrEqual(1100);
    // Forced: lock now records us, so our releaseFlushLock cleans it up.
    const body = JSON.parse(fs.readFileSync(lockFile('sess-a'), 'utf8'));
    expect(body.pid).toBe(process.pid);
  });

  it('acquires as soon as the holder releases mid-wait', async () => {
    fs.writeFileSync(lockFile('sess-a'), JSON.stringify({ pid: process.pid, startedAt: Date.now() }));
    setTimeout(() => fs.rmSync(lockFile('sess-a'), { force: true }), 600);
    const t0 = Date.now();
    await acquireFlushLockOrWait(dir, 'sess-a', 10_000);
    const elapsed = Date.now() - t0;
    expect(elapsed).toBeGreaterThanOrEqual(500);
    expect(elapsed).toBeLessThan(3000);
  });
});
