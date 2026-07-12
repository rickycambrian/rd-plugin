import fs from 'node:fs';
import { pendingFileFor, PENDING_DIR } from './paths.js';
import { normalizePendingEvent, type PendingEvent } from './event.js';

/** Number of newline-terminated records already in a session's pending log. */
export function pendingCount(claudeSessionId: string): number {
  try {
    const raw = fs.readFileSync(pendingFileFor(claudeSessionId), 'utf8');
    return raw.split('\n').filter((line) => line.trim()).length;
  } catch {
    return 0;
  }
}

/** Append one normalized event as a JSON line. Creates the dir if needed. */
export function appendPending(claudeSessionId: string, event: PendingEvent): void {
  fs.mkdirSync(PENDING_DIR, { recursive: true });
  fs.appendFileSync(pendingFileFor(claudeSessionId), `${JSON.stringify(event)}\n`, { mode: 0o600 });
}

/** Read + normalize all pending events for a session, sorted by sequence. */
export function readPending(claudeSessionId: string): PendingEvent[] {
  let raw: string;
  try {
    raw = fs.readFileSync(pendingFileFor(claudeSessionId), 'utf8');
  } catch {
    return [];
  }
  return raw
    .split('\n')
    .filter((line) => line.trim())
    .map((line, index) => {
      try {
        return normalizePendingEvent(JSON.parse(line), index);
      } catch {
        return normalizePendingEvent({}, index);
      }
    })
    .sort((a, b) => a.sequence - b.sequence);
}

/** Remove a session's pending log (best-effort; called after a final flush). */
export function clearPending(claudeSessionId: string): void {
  try {
    fs.rmSync(pendingFileFor(claudeSessionId), { force: true });
  } catch {
    // ignore
  }
}
