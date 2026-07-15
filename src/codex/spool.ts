import path from 'node:path';
import type { CodexHookTrace } from 'rickydata/kfdb';
import { writeFileAtomic } from '../lib/fsutil.js';
import { batchOperations } from '../lib/graph.js';
import {
  artifactSpoolFileName,
  contentArtifactRecord,
  graphBatchRecord,
  serializeBoundedSpoolRecord,
  splitGraphBatchByBytes,
  type ContentArtifactSpoolRecord,
  type GraphBatchSpoolRecord,
  type SpoolRecordIdentity,
} from '../lib/spool-record.js';
import { buildCodexGraphWriteBundle } from './graph.js';

/**
 * Codex uses the same bounded v3 two-record protocol as Claude Code: immutable
 * artifacts first, then graph-only batches. A distinct graph filename prefix
 * keeps Codex and Claude Code replay lanes unambiguous.
 */
export type CodexSpoolBody = ContentArtifactSpoolRecord | GraphBatchSpoolRecord;

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
    const bundle = buildCodexGraphWriteBundle(trace.walletAddress, [trace]);
    const identity: SpoolRecordIdentity = {
      traceKind: 'codex',
      walletAddress: trace.walletAddress,
      traceSessionId: trace.codexSessionId,
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
      const filePath = path.join(spoolDir, codexSpoolFileName(trace.codexSessionId, trace.turnIndex, batchIndex));
      writeFileAtomic(filePath, serializeBoundedSpoolRecord(body));
      written.push(filePath);
    });
  }
  return written;
}
