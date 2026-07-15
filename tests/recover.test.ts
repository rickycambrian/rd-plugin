import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { selectQuietPendingLogs, RECOVER_MIN_AGE_MS, RECOVER_MAX_PER_START } from '../src/lib/recover.js';

function makeDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'rd-recover-'));
}

function touch(dir: string, name: string, ageMs: number, now: number): void {
  const file = path.join(dir, name);
  fs.writeFileSync(file, '{}\n');
  const when = new Date(now - ageMs);
  fs.utimesSync(file, when, when);
}

describe('selectQuietPendingLogs', () => {
  it('returns only logs quieter than the minimum age, oldest first', () => {
    const dir = makeDir();
    const now = Date.now();
    touch(dir, 'fresh.jsonl', 60_000, now);
    touch(dir, 'old-a.jsonl', RECOVER_MIN_AGE_MS + 3_600_000, now);
    touch(dir, 'old-b.jsonl', RECOVER_MIN_AGE_MS + 7_200_000, now);
    touch(dir, 'not-a-log.txt', RECOVER_MIN_AGE_MS + 7_200_000, now);
    expect(selectQuietPendingLogs(dir, now)).toEqual(['old-b', 'old-a']);
  });

  it('caps the number of recovered sessions per start', () => {
    const dir = makeDir();
    const now = Date.now();
    for (let i = 0; i < RECOVER_MAX_PER_START + 5; i++) {
      touch(dir, `s-${String(i).padStart(2, '0')}.jsonl`, RECOVER_MIN_AGE_MS + (i + 1) * 60_000, now);
    }
    const picked = selectQuietPendingLogs(dir, now);
    expect(picked).toHaveLength(RECOVER_MAX_PER_START);
    // Oldest first: the largest ages sort to the front.
    expect(picked[0]).toBe(`s-${String(RECOVER_MAX_PER_START + 4).padStart(2, '0')}`);
  });

  it('returns empty for a missing directory', () => {
    expect(selectQuietPendingLogs(path.join(makeDir(), 'nope'), Date.now())).toEqual([]);
  });

  it('skips logs already flushed after their last event, so the capped sweep advances', () => {
    const dir = makeDir();
    const now = Date.now();
    // More quiet logs than the cap; the oldest ones already have a flush record
    // newer than their mtime. Pure oldest-first would re-select those forever
    // and never reach the unflushed tail.
    const flushed: Record<string, { updatedAt?: string }> = {};
    for (let i = 0; i < RECOVER_MAX_PER_START; i++) {
      touch(dir, `done-${i}.jsonl`, RECOVER_MIN_AGE_MS + 10_000_000 + i * 60_000, now);
      flushed[`done-${i}`] = { updatedAt: new Date(now - 1_000).toISOString() };
    }
    touch(dir, 'stranded.jsonl', RECOVER_MIN_AGE_MS + 3_600_000, now);
    expect(selectQuietPendingLogs(dir, now, flushed)).toEqual(['stranded']);
  });

  it('recovers logs whose events postdate their flush record or whose record is malformed', () => {
    const dir = makeDir();
    const now = Date.now();
    touch(dir, 'grew-after-flush.jsonl', RECOVER_MIN_AGE_MS + 3_600_000, now);
    touch(dir, 'bad-record.jsonl', RECOVER_MIN_AGE_MS + 7_200_000, now);
    const flushed = {
      'grew-after-flush': { updatedAt: new Date(now - RECOVER_MIN_AGE_MS - 7_200_000).toISOString() },
      'bad-record': { updatedAt: 'not-a-date' },
    };
    expect(selectQuietPendingLogs(dir, now, flushed)).toEqual(['bad-record', 'grew-after-flush']);
  });
});
