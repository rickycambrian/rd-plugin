import type { CodexHookTrace } from 'rickydata/kfdb';
import { buildCodexHookTraceWriteBundle, buildSessionLinkOperations, codexSessionNodeId, type ImmutableContentArtifactWrite } from 'rickydata/kfdb';
import { log } from '../lib/log.js';

type GraphOp = Record<string, unknown>;

/**
 * Extract the id of the single `CodexSession` create_node op the SDK builder
 * emits for a trace. The D6 session-link must point at the exact id the builder
 * produced (no independent id recipe exists — there is no `codexSessionNodeId`
 * export), so we read it back from the built ops. Returns undefined if the
 * builder emitted zero or more than one CodexSession node (never expected — a
 * unit test asserts exactly one — but handled fail-open here).
 */
export function extractCodexSessionNodeId(ops: GraphOp[]): string | undefined {
  const sessionNodes = ops.filter((op) => op.operation === 'create_node' && op.label === 'CodexSession');
  if (sessionNodes.length !== 1) return undefined;
  const id = sessionNodes[0].id;
  return typeof id === 'string' ? id : undefined;
}

/**
 * Build the schema-v3 graph operations for a set of Codex traces. For each
 * trace we emit the SDK's CodexHookTrace ops, then link the CodexSession node
 * into the shared SAME_SESSION star (D6) keyed on the codexSessionId, using the
 * CodexSession node id extracted from the just-built ops so the link can never
 * drift from the builder's id recipe.
 */
export function buildCodexGraphOperations(walletAddress: string, traces: CodexHookTrace[]): GraphOp[] {
  return buildCodexGraphWriteBundle(walletAddress, traces).operations;
}

export function buildCodexGraphWriteBundle(walletAddress: string, traces: CodexHookTrace[]): {
  operations: GraphOp[];
  contentArtifacts: ImmutableContentArtifactWrite[];
} {
  const operations: GraphOp[] = [];
  const contentArtifacts: ImmutableContentArtifactWrite[] = [];
  for (const trace of traces) {
    const bundle = buildCodexHookTraceWriteBundle(trace);
    const traceOps = bundle.operations;
    operations.push(...traceOps);
    contentArtifacts.push(...bundle.contentArtifacts);
    const fromNodeId = codexSessionNodeId(trace);
    if (fromNodeId) {
      operations.push(
        ...buildSessionLinkOperations({
          walletAddress,
          claudeSessionId: trace.codexSessionId,
          fromNodeId,
          fromLabel: 'CodexSession',
        }),
      );
    } else {
      log('warn', 'codex session-link skipped: CodexSession node not uniquely resolvable', {
        codexSessionId: trace.codexSessionId,
      });
    }
  }
  return { operations, contentArtifacts };
}
