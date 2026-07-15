import type { ImmutableContentArtifactWrite } from 'rickydata/kfdb';

export const GATEWAY_SPOOL_MAX_BYTES = 2 * 1024 * 1024;

export type SpoolTraceKind = 'claude_code' | 'codex';

export interface SpoolRecordIdentity {
  traceKind: SpoolTraceKind;
  walletAddress: string;
  traceSessionId: string;
  turnIndex: number;
}

export interface ContentArtifactSpoolRecord extends SpoolRecordIdentity {
  spoolVersion: 3;
  recordType: 'content_artifact';
  artifact: ImmutableContentArtifactWrite;
}

export interface GraphBatchSpoolRecord extends SpoolRecordIdentity {
  spoolVersion: 3;
  recordType: 'graph_batch';
  graphOperations: Array<Record<string, unknown>>;
}

export function contentArtifactRecord(
  identity: SpoolRecordIdentity,
  artifact: ImmutableContentArtifactWrite,
): ContentArtifactSpoolRecord {
  return { spoolVersion: 3, recordType: 'content_artifact', ...identity, artifact };
}

export function graphBatchRecord(
  identity: SpoolRecordIdentity,
  graphOperations: Array<Record<string, unknown>>,
): GraphBatchSpoolRecord {
  return { spoolVersion: 3, recordType: 'graph_batch', ...identity, graphOperations };
}

/** Serialize only records accepted by the gateway's hard 2 MiB spool ceiling. */
export function serializeBoundedSpoolRecord(record: ContentArtifactSpoolRecord | GraphBatchSpoolRecord): string {
  const serialized = JSON.stringify(record);
  const bytes = Buffer.byteLength(serialized, 'utf8');
  if (bytes > GATEWAY_SPOOL_MAX_BYTES) {
    throw new Error(`spool record is ${bytes} bytes; gateway maximum is ${GATEWAY_SPOOL_MAX_BYTES}`);
  }
  return serialized;
}

/**
 * Split an operation-count-bounded batch again by serialized byte size. This
 * makes the file-size invariant explicit instead of assuming <=900 ops fit.
 */
export function splitGraphBatchByBytes(
  identity: SpoolRecordIdentity,
  operations: Array<Record<string, unknown>>,
): Array<Array<Record<string, unknown>>> {
  if (operations.length === 0) return [[]];
  const batches: Array<Array<Record<string, unknown>>> = [];
  let current: Array<Record<string, unknown>> = [];
  for (const operation of operations) {
    const candidate = [...current, operation];
    const bytes = Buffer.byteLength(JSON.stringify(graphBatchRecord(identity, candidate)), 'utf8');
    if (bytes <= GATEWAY_SPOOL_MAX_BYTES) {
      current = candidate;
      continue;
    }
    if (current.length === 0) {
      throw new Error('one graph operation exceeds the gateway spool record limit');
    }
    batches.push(current);
    current = [operation];
    serializeBoundedSpoolRecord(graphBatchRecord(identity, current));
  }
  if (current.length > 0) batches.push(current);
  return batches;
}

export function artifactSpoolFileName(
  identity: SpoolRecordIdentity,
  artifact: ImmutableContentArtifactWrite,
  artifactIndex: number,
): string {
  const safe = identity.traceSessionId.replace(/[^A-Za-z0-9_.-]/g, '_') || 'unknown';
  const kind = identity.traceKind === 'claude_code' ? 'claude' : 'codex';
  const hash = artifact.key.replace('content-artifact:sha256:', '').slice(0, 16);
  return `artifact-${kind}-${safe}-${identity.turnIndex}-a${String(artifactIndex).padStart(4, '0')}-${hash}.json`;
}
