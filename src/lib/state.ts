import { STATE_FILE, STATE_DIR } from './paths.js';
import { readJsonFile, writeJsonFileAtomic, sha256Hex } from './fsutil.js';
import { acquireFlushLockOrWait, releaseFlushLock } from './flush-lock.js';
import type { PendingEvent } from './event.js';

/** Per-session flush bookkeeping used for idempotency. */
export interface FlushedEntry {
  /** Fingerprint of the last successfully flushed unit (sessionId + events + sink). */
  fingerprint?: string;
  /** Highest pending sequence already streamed to the legacy endpoints. */
  legacyStreamMaxSequence?: number;
  /**
   * Highest message_count / tool_call_count ever sent to the legacy session_end
   * endpoint for this session. That endpoint OVERWRITES unconditionally, so a
   * later re-send must never go lower — we clamp to these floors.
   */
  lastMessageCount?: number;
  lastToolCallCount?: number;
  /** ISO timestamp of the last flush. */
  updatedAt?: string;
}

export interface PluginState {
  flushed: Record<string, FlushedEntry>;
  /** Backfill resumable watermark: ISO date of the last replayed session. */
  backfillWatermark?: string;
  /** Set of claudeSessionIds already backfilled. */
  backfilled?: Record<string, true>;
}

export function readState(): PluginState {
  // Fresh default per call — a shared fallback object would alias every
  // caller's state when the file is missing.
  const state = readJsonFile<PluginState>(STATE_FILE, { flushed: {} });
  if (!state.flushed || typeof state.flushed !== 'object') state.flushed = {};
  return state;
}

export function writeState(state: PluginState): void {
  writeJsonFileAtomic(STATE_FILE, state);
}

export function flushedEntry(state: PluginState, sessionId: string): FlushedEntry {
  return state.flushed[sessionId] ?? {};
}

export function setFlushedEntry(state: PluginState, sessionId: string, entry: FlushedEntry): void {
  state.flushed[sessionId] = { ...flushedEntry(state, sessionId), ...entry, updatedAt: new Date().toISOString() };
}

/**
 * Apply a mutation to state.json under the global state lock (read-merge-write).
 * writeState() is atomic on disk, but the surrounding read-modify-write is not:
 * flushes from concurrently running sessions each read state, mutate their own
 * entry, and write the whole file back — the last writer clobbers everyone
 * else's entries. Found in production 2026-07-14: sessions whose graph nodes
 * exist in KFDB but whose flushed record was lost, which defeats fingerprint
 * idempotency and the legacy session-end floors. Serializing only the
 * read-merge-write (not the flush itself) closes the race cheaply.
 */
export async function updateStateLocked(mutate: (state: PluginState) => void): Promise<void> {
  await acquireFlushLockOrWait(STATE_DIR, 'state', 10_000);
  try {
    const state = readState();
    mutate(state);
    writeState(state);
  } finally {
    releaseFlushLock(STATE_DIR, 'state');
  }
}

/** Merge one session's flushed entry into the current on-disk state under the lock. */
export async function commitFlushedEntry(sessionId: string, entry: FlushedEntry): Promise<void> {
  await updateStateLocked((state) => setFlushedEntry(state, sessionId, entry));
}

/**
 * Fingerprint of a flush unit: stable across re-reads of the same pending log,
 * changes the moment a new event arrives. Drives idempotency so a Stop-then-
 * SessionEnd double-fire with an identical event set is a no-op.
 */
export function computeFingerprint(claudeSessionId: string, sink: string, events: PendingEvent[]): string {
  const shape = events.map((e) => `${e.sequence}:${e.hookEventName}:${e.toolUseId ?? ''}`).join('|');
  return sha256Hex(`${claudeSessionId} ${sink} ${events.length} ${shape}`);
}
