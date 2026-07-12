import path from 'node:path';
import type { ClaudeCodeHookTrace } from 'rickydata/kfdb';
import { writeFileAtomic } from './fsutil.js';
import { buildGraphOperations, batchOperations } from './graph.js';

/**
 * Body written to a spool file. `spoolVersion` 2 adds `graphOperations`: the
 * exact schema-v3 `/api/v1/write` operations the direct sink would write for
 * this trace (ClaudeCodeHookTrace ops + D6 session-link ops). The gateway
 * ingestor forwards these verbatim, so a session captured through the gateway
 * yields byte-identical `ClaudeCodeSession` node ids to one captured locally.
 * Every version-1 field is retained unchanged — the gateway still reads the
 * trace itself to write the legacy `/api/v1/plugin/*` stream.
 */
export interface SpoolBody extends ClaudeCodeHookTrace {
  spoolVersion: 2;
  graphOperations: Array<Record<string, unknown>>;
}

export function spoolFileName(claudeSessionId: string, seq: number, batchIndex = 0): string {
  const safe = String(claudeSessionId || 'unknown').replace(/[^A-Za-z0-9_.-]/g, '_');
  const suffix = batchIndex > 0 ? `-b${batchIndex}` : '';
  return `trace-${safe}-${seq}${suffix}.json`;
}

/**
 * Write one spool file per flush unit (turn) to RD_SPOOL_DIR, atomically
 * (tmp + rename). No network, no config required — the gateway runner reads and
 * ingests these files. seq = turnIndex so re-flushes overwrite deterministically.
 *
 * Each trace's graph operations are batched at the same <=900-ops ceiling as the
 * direct sink. A turn trace is far below that in practice, so this is one file
 * per trace; a trace that ever exceeds the ceiling is split into `-bN` files.
 */
export function writeSpool(spoolDir: string, traces: ClaudeCodeHookTrace[]): string[] {
  const written: string[] = [];
  for (const trace of traces) {
    const graphOperations = buildGraphOperations(trace.walletAddress, [trace]);
    const batches = batchOperations(graphOperations);
    if (batches.length === 0) batches.push([]);
    batches.forEach((batch, batchIndex) => {
      const body: SpoolBody = { ...trace, spoolVersion: 2, graphOperations: batch };
      const filePath = path.join(spoolDir, spoolFileName(trace.claudeSessionId, trace.turnIndex, batchIndex));
      writeFileAtomic(filePath, JSON.stringify(body));
      written.push(filePath);
    });
  }
  return written;
}
