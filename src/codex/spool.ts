import path from 'node:path';
import type { CodexHookTrace } from 'rickydata/kfdb';
import { writeFileAtomic } from '../lib/fsutil.js';
import { batchOperations } from '../lib/graph.js';
import { buildCodexGraphOperations } from './graph.js';

/**
 * Body written to a Codex spool file. `spoolVersion` 2 carries `graphOperations`
 * — the exact schema-v3 `/api/v1/write` ops the direct sink would write for this
 * trace (CodexHookTrace ops + D6 session-link). By construction these are
 * byte-identical to the direct-sink ops for the same event stream, so a Codex
 * session captured through the gateway yields the same CodexSession node id as
 * one captured locally. A distinct `codex-trace-` filename prefix keeps these
 * files from being swept by the Claude Code (`trace-*`) v2 ingest path.
 */
export interface CodexSpoolBody extends CodexHookTrace {
  spoolVersion: 2;
  graphOperations: Array<Record<string, unknown>>;
}

export function codexSpoolFileName(codexSessionId: string, turnIndex: number, batchIndex = 0): string {
  const safe = String(codexSessionId || 'unknown').replace(/[^A-Za-z0-9_.-]/g, '_');
  const suffix = batchIndex > 0 ? `-b${batchIndex}` : '';
  return `codex-trace-${safe}-${turnIndex}${suffix}.json`;
}

/**
 * Write one spool file per Codex turn to RD_SPOOL_DIR, atomically (tmp + rename).
 * No network, no config. Each trace's graph ops are batched at the same
 * <=900-ops ceiling as the direct sink; a turn is far below that in practice, so
 * this is one file per turn (a trace exceeding the ceiling splits into `-bN`).
 */
export function writeCodexSpool(spoolDir: string, traces: CodexHookTrace[]): string[] {
  const written: string[] = [];
  for (const trace of traces) {
    const graphOperations = buildCodexGraphOperations(trace.walletAddress, [trace]);
    const batches = batchOperations(graphOperations);
    if (batches.length === 0) batches.push([]);
    batches.forEach((batch, batchIndex) => {
      const body: CodexSpoolBody = { ...trace, spoolVersion: 2, graphOperations: batch };
      const filePath = path.join(spoolDir, codexSpoolFileName(trace.codexSessionId, trace.turnIndex, batchIndex));
      writeFileAtomic(filePath, JSON.stringify(body));
      written.push(filePath);
    });
  }
  return written;
}
