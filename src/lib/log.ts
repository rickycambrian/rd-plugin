import fs from 'node:fs';
import path from 'node:path';
import { LOG_FILE } from './paths.js';

const LEVELS: Record<string, number> = { debug: 0, info: 1, warn: 2, error: 3 };

let currentLevel = 'info';

export function setLogLevel(level: string): void {
  if (level in LEVELS) currentLevel = level;
}

/**
 * Append a structured log line to ~/.rickydata/logs/rd-plugin.log. Best-effort:
 * a logging failure must never propagate out of a hook.
 */
export function log(level: string, message: string, fields: Record<string, unknown> = {}): void {
  try {
    if ((LEVELS[level] ?? 1) < (LEVELS[currentLevel] ?? 1)) return;
    const entry = JSON.stringify({ ts: new Date().toISOString(), level, message, ...fields });
    fs.mkdirSync(path.dirname(LOG_FILE), { recursive: true });
    fs.appendFileSync(LOG_FILE, `${entry}\n`, { mode: 0o600 });
  } catch {
    // logging is never allowed to break a session
  }
}
