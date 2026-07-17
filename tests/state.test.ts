import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { STATE_FILE } from '../src/lib/paths.js';
import {
  readState,
  writeState,
  setFlushedEntry,
  commitFlushedEntry,
  updateStateLocked,
} from '../src/lib/state.js';

function resetState(): void {
  fs.rmSync(STATE_FILE, { force: true });
}

describe('state locked read-merge-write', () => {
  it('commitFlushedEntry does not clobber entries written after our read', async () => {
    resetState();
    // Process A reads state (empty), then process B lands its entry on disk.
    const stale = readState();
    setFlushedEntry(stale, 'session-a', { fingerprint: 'fp-a' });
    const other = readState();
    setFlushedEntry(other, 'session-b', { fingerprint: 'fp-b' });
    writeState(other);

    // The old writeState(stale) path would erase session-b here. The locked
    // commit merges into the CURRENT file instead.
    await commitFlushedEntry('session-a', stale.flushed['session-a']);

    const final = readState();
    expect(final.flushed['session-a']?.fingerprint).toBe('fp-a');
    expect(final.flushed['session-b']?.fingerprint).toBe('fp-b');
  });

  it('reproduces the lost update with raw writeState (documents the old bug)', () => {
    resetState();
    const a = readState();
    const b = readState();
    setFlushedEntry(a, 'session-a', { fingerprint: 'fp-a' });
    setFlushedEntry(b, 'session-b', { fingerprint: 'fp-b' });
    writeState(a);
    writeState(b); // last writer wins → session-a is gone
    expect(readState().flushed['session-a']).toBeUndefined();
  });

  it('commitFlushedEntry merges into an existing entry for the same session', async () => {
    resetState();
    await commitFlushedEntry('session-a', { legacyStreamMaxSequence: 7, codexMaxSequence: 11 });
    await commitFlushedEntry('session-a', { fingerprint: 'fp-a' });
    const entry = readState().flushed['session-a'];
    expect(entry?.fingerprint).toBe('fp-a');
    expect(entry?.legacyStreamMaxSequence).toBe(7);
    expect(entry?.codexMaxSequence).toBe(11);
    expect(entry?.updatedAt).toBeTruthy();
  });

  it('updateStateLocked releases the lock on mutator failure', async () => {
    resetState();
    await expect(updateStateLocked(() => { throw new Error('boom'); })).rejects.toThrow('boom');
    // Lock must be free again: a follow-up commit completes promptly.
    await commitFlushedEntry('session-c', { fingerprint: 'fp-c' });
    expect(readState().flushed['session-c']?.fingerprint).toBe('fp-c');
  });
});
