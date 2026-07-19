import os from 'node:os';
import path from 'node:path';

/**
 * Filesystem layout under ~/.rickydata/ (SPEC-000 §Filesystem).
 * Everything rd-plugin owns is namespaced under state/queue/logs subdirs so it
 * never collides with other existing plugin consumers that also
 * write to ~/.rickydata/.
 */
export const DATA_DIR = path.join(os.homedir(), '.rickydata');

/** Existing config file, shared with the legacy tracking plugin. */
export const CONFIG_FILE = path.join(DATA_DIR, 'config.json');

/** Shared S2D derive-session cache (same file all writers reuse per wallet). */
export const DERIVE_SESSION_FILE = path.join(DATA_DIR, 'derive-session.json');

/** rd-plugin state root. */
export const STATE_DIR = path.join(DATA_DIR, 'state', 'rd-plugin');

/** Flush fingerprints + backfill watermark. */
export const STATE_FILE = path.join(STATE_DIR, 'state.json');

/** Per-session fast-append pending event logs. */
export const PENDING_DIR = path.join(STATE_DIR, 'pending');

/** Compact current lifecycle state for local real-time consumers. */
export const LIFECYCLE_DIR = path.join(STATE_DIR, 'lifecycle');

/** Offline retry queue. */
export const QUEUE_DIR = path.join(DATA_DIR, 'queue', 'rd-plugin');

/** Dead-letter directory for queue entries that exhausted their retries. */
export const QUEUE_DEAD_DIR = path.join(DATA_DIR, 'queue-failed', 'rd-plugin');

/** Plugin log file (respects config log_level). */
export const LOG_FILE = path.join(DATA_DIR, 'logs', 'rd-plugin.log');

export function pendingFileFor(claudeSessionId: string): string {
  return path.join(PENDING_DIR, `${safeName(claudeSessionId)}.jsonl`);
}

/** Filesystem-safe representation of an arbitrary id. */
export function safeName(value: string): string {
  return String(value || 'unknown').replace(/[^A-Za-z0-9_.-]/g, '_').slice(0, 200);
}
