import { describe, it, expect } from 'vitest';
import { selectBackfillCandidates, type DiscoveredSession } from '../src/lib/backfill-core.js';

const files: DiscoveredSession[] = [
  { file: 'a.jsonl', id: 'a', mtimeMs: 300 },
  { file: 'b.jsonl', id: 'b', mtimeMs: 100 },
  { file: 'c.jsonl', id: 'c', mtimeMs: 200 },
];

describe('selectBackfillCandidates', () => {
  it('returns oldest-first so the watermark advances monotonically', () => {
    const out = selectBackfillCandidates(files, { limit: 10, done: {} });
    expect(out.map((s) => s.id)).toEqual(['b', 'c', 'a']);
  });

  it('skips already-backfilled ids', () => {
    const out = selectBackfillCandidates(files, { limit: 10, done: { c: true } });
    expect(out.map((s) => s.id)).toEqual(['b', 'a']);
  });

  it('applies the since lower bound (inclusive)', () => {
    const out = selectBackfillCandidates(files, { since: 200, limit: 10, done: {} });
    expect(out.map((s) => s.id)).toEqual(['c', 'a']);
  });

  it('caps at limit after sorting (resumable in chunks)', () => {
    const first = selectBackfillCandidates(files, { limit: 2, done: {} });
    expect(first.map((s) => s.id)).toEqual(['b', 'c']);
    const done = Object.fromEntries(first.map((s) => [s.id, true as const]));
    const next = selectBackfillCandidates(files, { limit: 2, done });
    expect(next.map((s) => s.id)).toEqual(['a']);
  });
});
