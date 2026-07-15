import path from 'node:path';
import type { ClaudeCodeHookTrace } from 'rickydata/kfdb';
import { writeFileAtomic } from './fsutil.js';
import { buildGraphWriteBundle, batchOperations } from './graph.js';
import {
  artifactSpoolFileName,
  contentArtifactRecord,
  graphBatchRecord,
  serializeBoundedSpoolRecord,
  splitGraphBatchByBytes,
  type ContentArtifactSpoolRecord,
  type GraphBatchSpoolRecord,
  type SpoolRecordIdentity,
} from './spool-record.js';

/**
 * Version 3 is a two-record protocol: one bounded immutable-artifact prelude
 * per artifact, followed by graph-only batches. Raw observables are never
 * duplicated in the graph record. The gateway accepts v1/v2 for compatibility.
 */
export type SpoolBody = ContentArtifactSpoolRecord | GraphBatchSpoolRecord;

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
    const bundle = buildGraphWriteBundle(trace.walletAddress, [trace]);
    const identity: SpoolRecordIdentity = {
      traceKind: 'claude_code',
      walletAddress: trace.walletAddress,
      traceSessionId: trace.claudeSessionId,
      turnIndex: trace.turnIndex,
    };
    const artifacts = [...new Map(bundle.contentArtifacts.map((artifact) => [artifact.key, artifact])).values()];
    artifacts.forEach((artifact, artifactIndex) => {
      const body = contentArtifactRecord(identity, artifact);
      const filePath = path.join(spoolDir, artifactSpoolFileName(identity, artifact, artifactIndex));
      writeFileAtomic(filePath, serializeBoundedSpoolRecord(body));
      written.push(filePath);
    });
    const countBatches = batchOperations(bundle.operations);
    if (countBatches.length === 0) countBatches.push([]);
    const batches = countBatches.flatMap((batch) => splitGraphBatchByBytes(identity, batch));
    batches.forEach((batch, batchIndex) => {
      const body = graphBatchRecord(identity, batch);
      const filePath = path.join(spoolDir, spoolFileName(trace.claudeSessionId, trace.turnIndex, batchIndex));
      writeFileAtomic(filePath, serializeBoundedSpoolRecord(body));
      written.push(filePath);
    });
  }
  return written;
}
