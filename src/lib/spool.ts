import path from 'node:path';
import type { ClaudeCodeHookTrace } from 'rickydata/kfdb';
import { writeFileAtomic } from './fsutil.js';

/** Body written to a spool file: the trace input plus a version discriminator. */
export interface SpoolBody extends ClaudeCodeHookTrace {
  spoolVersion: 1;
}

export function spoolFileName(claudeSessionId: string, seq: number): string {
  const safe = String(claudeSessionId || 'unknown').replace(/[^A-Za-z0-9_.-]/g, '_');
  return `trace-${safe}-${seq}.json`;
}

/**
 * Write one spool file per flush unit (turn) to RD_SPOOL_DIR, atomically
 * (tmp + rename). No network, no config required — the gateway runner reads and
 * ingests these files. seq = turnIndex so re-flushes overwrite deterministically.
 */
export function writeSpool(spoolDir: string, traces: ClaudeCodeHookTrace[]): string[] {
  const written: string[] = [];
  for (const trace of traces) {
    const body: SpoolBody = { ...trace, spoolVersion: 1 };
    const filePath = path.join(spoolDir, spoolFileName(trace.claudeSessionId, trace.turnIndex));
    writeFileAtomic(filePath, JSON.stringify(body));
    written.push(filePath);
  }
  return written;
}
