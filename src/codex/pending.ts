import fs from 'node:fs';
import { CODEX_PENDING_DIR, codexPendingFileFor } from './paths.js';
import { normalizeCodexPendingEvent, type CodexPendingEvent } from './event.js';

/** Number of newline-terminated records already in a session's pending log. */
export function codexPendingCount(codexSessionId: string): number {
  try {
    const raw = fs.readFileSync(codexPendingFileFor(codexSessionId), 'utf8');
    return raw.split('\n').filter((line) => line.trim()).length;
  } catch {
    return 0;
  }
}

/** Append one normalized event as a JSON line. Creates the dir if needed. */
export function appendCodexPending(codexSessionId: string, event: CodexPendingEvent): void {
  fs.mkdirSync(CODEX_PENDING_DIR, { recursive: true });
  fs.appendFileSync(codexPendingFileFor(codexSessionId), `${JSON.stringify(event)}\n`, { mode: 0o600 });
}

/** Read + normalize all pending events for a session, sorted by sequence. */
export function readCodexPending(codexSessionId: string): CodexPendingEvent[] {
  let raw: string;
  try {
    raw = fs.readFileSync(codexPendingFileFor(codexSessionId), 'utf8');
  } catch {
    return [];
  }
  return raw
    .split('\n')
    .filter((line) => line.trim())
    .map((line, index) => {
      try {
        return normalizeCodexPendingEvent(JSON.parse(line), index);
      } catch {
        return normalizeCodexPendingEvent({}, index);
      }
    })
    .sort((a, b) => a.sequence - b.sequence);
}

/** Remove a session's pending log (best-effort; called after a final flush). */
export function clearCodexPending(codexSessionId: string): void {
  try {
    fs.rmSync(codexPendingFileFor(codexSessionId), { force: true });
  } catch {
    // ignore
  }
}
