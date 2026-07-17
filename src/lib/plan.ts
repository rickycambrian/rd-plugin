import { createHash } from 'node:crypto';
import type { TranscriptPlan } from './transcript.js';

/**
 * Graph ops for plan-mode plans: a `Plan` node per plan document, a `HAS_PLAN`
 * edge from the ClaudeCodeSession node, and (when the plan lives on disk) a
 * `PLAN_FILE` edge to the same `CodeFile` node the SDK mints for edits.
 *
 * The id/value recipes below intentionally mirror the vendored SDK's
 * claude-code-hook-trace.js (uuidV5 over the same namespaces, sha256 path
 * hashes, typed value unions) so Plan-adjacent nodes merge with SDK-emitted
 * ones instead of forking ids. The SDK does not export those helpers.
 */

const TRACE_SCHEMA_VERSION = 3;

function uuidV5(name: string, namespace: string): string {
  const ns = Buffer.from(namespace.replace(/-/g, ''), 'hex');
  const hash = createHash('sha1').update(Buffer.concat([ns, Buffer.from(name)])).digest();
  hash[6] = (hash[6] & 0x0f) | 0x50;
  hash[8] = (hash[8] & 0x3f) | 0x80;
  const hex = hash.subarray(0, 16).toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

const UUID_SEED = '6ba7b811-9dad-11d1-80b4-00c04fd430c8';
const KG_NAMESPACE = uuidV5('rickydata-claude-code-hook-knowledge-graph-v1', UUID_SEED);
const EXECUTION_KG_NAMESPACE = uuidV5('rickydata-execution-knowledge-graph-v1', UUID_SEED);

function deterministicId(kind: string, parts: Array<string | number>): string {
  return uuidV5(`${kind}:${parts.map((p) => String(p)).join(':')}`, KG_NAMESPACE);
}

function deterministicExecutionId(kind: string, parts: Array<string | number>): string {
  return uuidV5(`${kind}:${parts.map((p) => String(p)).join(':')}`, EXECUTION_KG_NAMESPACE);
}

function stableHash(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

function basename(input: string): string {
  const normalized = input.replace(/\\/g, '/');
  return normalized.split('/').filter(Boolean).pop() ?? normalized;
}

type KfdbValue = { String: string } | { Integer: number };
function str(v: string): KfdbValue {
  return { String: v };
}
function int(v: number): KfdbValue {
  return { Integer: v };
}

export type PlanGraphOp = Record<string, unknown>;

export function planNodeId(plan: TranscriptPlan): string {
  return plan.planFilePath
    ? deterministicExecutionId('Plan', [plan.planFilePath])
    : deterministicExecutionId('Plan', ['content', stableHash(plan.content ?? '')]);
}

/**
 * Build merge ops for a set of plans. `sessionNodeId` (the SDK's
 * ClaudeCodeSession node id) is optional so the standalone plans-dir sweep can
 * upsert plan bodies without a session edge.
 */
/**
 * Minimal ClaudeCodeSession merge node so a plans-only pass can anchor
 * HAS_PLAN edges for sessions that were never fully backfilled. Merge-safe:
 * a real session flush only adds richer properties on the same node id.
 */
export function buildSessionStubOperation(
  sessionNodeId: string,
  walletAddress: string,
  agentId: string,
  claudeSessionId: string,
): PlanGraphOp {
  return {
    operation: 'create_node',
    id: sessionNodeId,
    label: 'ClaudeCodeSession',
    mode: 'merge',
    properties: {
      agent_id: str(agentId),
      session_id: str(claudeSessionId),
      claude_session_id: str(claudeSessionId),
      wallet_address: str(walletAddress.toLowerCase()),
      source: str('claude-code-hooks'),
      schema_version: int(TRACE_SCHEMA_VERSION),
    },
  };
}

export function buildPlanOperations(plans: TranscriptPlan[], sessionNodeId?: string): PlanGraphOp[] {
  const operations: PlanGraphOp[] = [];
  for (const plan of plans) {
    if (!plan.planFilePath && !plan.content) continue;
    const nodeId = planNodeId(plan);
    const properties: Record<string, KfdbValue> = {
      source: str('claude-code-plan-mode'),
      schema_version: int(TRACE_SCHEMA_VERSION),
    };
    if (plan.planFilePath) {
      properties.path = str(plan.planFilePath);
      properties.path_hash = str(stableHash(plan.planFilePath));
      properties.slug = str(basename(plan.planFilePath).replace(/\.md$/, ''));
    }
    if (plan.content) {
      properties.content = str(plan.content);
      properties.content_hash = str(stableHash(plan.content));
      properties.content_length = int(plan.content.length);
    }
    if (plan.updatedAt !== undefined) properties.updated_at = int(plan.updatedAt);
    operations.push({ operation: 'create_node', id: nodeId, label: 'Plan', mode: 'merge', properties });

    if (sessionNodeId) {
      operations.push({
        operation: 'create_edge',
        id: deterministicId('HAS_PLAN', [sessionNodeId, nodeId]),
        from: sessionNodeId,
        to: nodeId,
        edge_type: 'HAS_PLAN',
        properties: { source: str('claude-code-plan-mode') },
      });
    }

    if (plan.planFilePath) {
      const fileNodeId = deterministicExecutionId('CodeFile', [plan.planFilePath]);
      operations.push(
        {
          operation: 'create_node',
          id: fileNodeId,
          label: 'CodeFile',
          mode: 'merge',
          properties: {
            path: str(plan.planFilePath),
            path_hash: str(stableHash(plan.planFilePath)),
            basename: str(basename(plan.planFilePath)),
            extension: str('md'),
            schema_version: int(TRACE_SCHEMA_VERSION),
          },
        },
        {
          operation: 'create_edge',
          id: deterministicId('PLAN_FILE', [nodeId, fileNodeId]),
          from: nodeId,
          to: fileNodeId,
          edge_type: 'PLAN_FILE',
          properties: { source: str('claude-code-plan-mode') },
        },
      );
    }
  }
  return operations;
}
