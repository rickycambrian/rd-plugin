import type { ClaudeCodeHookTrace } from 'rickydata/kfdb';
import { buildClaudeCodeHookTraceWriteBundle, buildSessionLinkOperations, claudeCodeSessionNodeId, type ImmutableContentArtifactWrite } from 'rickydata/kfdb';
import { postJson } from './http.js';
import type { DeriveHeaders } from './derive.js';

const BATCH_SIZE = 900;

/**
 * Client timeout for a single graph-write batch. Real production `/api/v1/write`
 * batches of the full 900-op ceiling routinely take 10–20s server-side
 * (measured execution_time_ms 10.7s / 11.4s / 19.5s), so a tighter client
 * timeout aborts a write the server would have completed and needlessly queues
 * it. 60s leaves ample headroom. This is the single source of truth for every
 * graph-write path (direct flush, codex flush, queue drain) — the drain MUST
 * replay at >= the writer's timeout or a queued entry can never make progress.
 */
export const GRAPH_WRITE_TIMEOUT_MS = 60000;

type GraphOp = Record<string, unknown>;

/**
 * Build the schema-v3 graph operations for a set of traces. For each trace we
 * emit the SDK's ClaudeCodeHookTrace ops, then link the session node into the
 * shared SAME_SESSION star (D6) by emitting a HarnessSessionKey merge node +
 * edge from the ClaudeCodeSession node.
 *
 * The ClaudeCodeSession node id comes from the SDK's own
 * `claudeCodeSessionNodeId` helper (the exact id the builder emits) so the link
 * cannot drift from the builder's id recipe.
 */
export function buildGraphOperations(walletAddress: string, traces: ClaudeCodeHookTrace[]): GraphOp[] {
  return buildGraphWriteBundle(walletAddress, traces).operations;
}

export function buildGraphWriteBundle(walletAddress: string, traces: ClaudeCodeHookTrace[]): {
  operations: GraphOp[];
  contentArtifacts: ImmutableContentArtifactWrite[];
} {
  const operations: GraphOp[] = [];
  const contentArtifacts: ImmutableContentArtifactWrite[] = [];
  for (const trace of traces) {
    const bundle = buildClaudeCodeHookTraceWriteBundle(trace);
    operations.push(...bundle.operations);
    contentArtifacts.push(...bundle.contentArtifacts);
    const fromNodeId = claudeCodeSessionNodeId(trace);
    operations.push(
      ...buildSessionLinkOperations({
        walletAddress,
        claudeSessionId: trace.claudeSessionId,
        fromNodeId,
        fromLabel: 'ClaudeCodeSession',
      }),
    );
  }
  return { operations, contentArtifacts };
}

/**
 * POST graph ops to {apiUrl}/api/v1/write in batches of <=900, with Bearer auth
 * plus S2D headers and skip_embedding. Throws on the first failed batch so the
 * caller can queue the remaining payload.
 */
export async function writeGraph(
  apiUrl: string,
  apiKey: string,
  deriveHeaders: DeriveHeaders,
  operations: GraphOp[],
  timeoutMs = GRAPH_WRITE_TIMEOUT_MS,
): Promise<number> {
  const base = apiUrl.replace(/\/$/, '');
  const headers = { Authorization: `Bearer ${apiKey}`, ...deriveHeaders };
  for (let offset = 0; offset < operations.length; offset += BATCH_SIZE) {
    const batch = operations.slice(offset, offset + BATCH_SIZE);
    const result = await postJson(`${base}/api/v1/write`, { operations: batch, skip_embedding: true }, headers, timeoutMs);
    if (!result.ok) {
      throw new Error(`write graph failed: ${result.status} ${result.text.slice(0, 500)}`);
    }
  }
  return operations.length;
}

export function batchOperations(operations: GraphOp[]): GraphOp[][] {
  const batches: GraphOp[][] = [];
  for (let offset = 0; offset < operations.length; offset += BATCH_SIZE) {
    batches.push(operations.slice(offset, offset + BATCH_SIZE));
  }
  return batches;
}
