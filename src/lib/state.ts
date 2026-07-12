import { STATE_FILE } from './paths.js';
import { readJsonFile, writeJsonFileAtomic, sha256Hex } from './fsutil.js';
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

const EMPTY: PluginState = { flushed: {} };

export function readState(): PluginState {
  const state = readJsonFile<PluginState>(STATE_FILE, EMPTY);
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
 * Fingerprint of a flush unit: stable across re-reads of the same pending log,
 * changes the moment a new event arrives. Drives idempotency so a Stop-then-
 * SessionEnd double-fire with an identical event set is a no-op.
 */
export function computeFingerprint(claudeSessionId: string, sink: string, events: PendingEvent[]): string {
  const shape = events.map((e) => `${e.sequence}:${e.hookEventName}:${e.toolUseId ?? ''}`).join('|');
  return sha256Hex(`${claudeSessionId} ${sink} ${events.length} ${shape}`);
}
