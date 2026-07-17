import type { ClaudeCodeHookTrace } from 'rickydata/kfdb';
import { buildClaudeCodeHookTraceWriteBundle, buildSessionLinkOperations, claudeCodeSessionNodeId, type ImmutableContentArtifactWrite } from 'rickydata/kfdb';
import { postJson } from './http.js';
import { kfdbAuthHeaders, type KfdbAuth } from './kfdb-auth.js';

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
 * POST graph ops to {apiUrl}/api/v1/write in batches of <=900, with KFDB auth
 * (Bearer or ERC-8128) plus S2D headers and skip_embedding. Throws on the first
 * failed batch so the caller can queue the remaining payload.
 */
export async function writeGraph(
  apiUrl: string,
  auth: KfdbAuth,
  operations: GraphOp[],
  timeoutMs = GRAPH_WRITE_TIMEOUT_MS,
): Promise<number> {
  const base = apiUrl.replace(/\/$/, '');
  const url = `${base}/api/v1/write`;
  for (let offset = 0; offset < operations.length; offset += BATCH_SIZE) {
    const batch = operations.slice(offset, offset + BATCH_SIZE);
    const result = await postJson(url, { operations: batch, skip_embedding: true }, kfdbAuthHeaders(auth, 'POST', url), timeoutMs);
    if (!result.ok) {
      throw new Error(`write graph failed: ${result.status} ${result.text.slice(0, 500)}`);
    }
  }
  return operations.length;
}

type KfdbValue = { String: string } | { Integer: number } | { Array: KfdbValue[] };
const str = (v: string): KfdbValue => ({ String: v });
const int = (v: number): KfdbValue => ({ Integer: v });
const strArray = (vs: string[]): KfdbValue => ({ Array: vs.map(str) });

export const ISSUE_REFS_SCHEMA = 'rickydata.issue_refs.v1';

/**
 * A supplementary ClaudeCodeSession merge-op that stamps the session's detected
 * GitHub issue refs (+ current branch) as first-class node properties the home
 * linker reads deterministically. Rides the same node id the SDK builder emits
 * (`claudeCodeSessionNodeId`), so it merges onto the existing session node. The
 * per-event prompt text the SDK persists is hashed, not stored — this op is the
 * only channel carrying readable refs across EVERY prompt of the session.
 * Returns null when no refs were found (branch stays readable via repository.branch).
 */
export function buildSessionIssueRefsOp(
  sessionNodeId: string,
  facts: { explicit: string[]; slug: string[]; branch?: string },
): GraphOp | null {
  if (facts.explicit.length === 0 && facts.slug.length === 0) return null;
  const properties: Record<string, KfdbValue> = {
    issue_refs_schema: str(ISSUE_REFS_SCHEMA),
    issue_refs_updated_at: int(Date.now()),
  };
  if (facts.explicit.length) properties.issue_refs = strArray(facts.explicit);
  if (facts.slug.length) properties.issue_refs_slug = strArray(facts.slug);
  if (facts.branch) properties.branch = str(facts.branch);
  return { operation: 'create_node', id: sessionNodeId, label: 'ClaudeCodeSession', mode: 'merge', properties };
}

/**
 * Session-origin facts merge-op: was this session a human at a terminal or an
 * automated harness? No captured property discriminates today (agent_id,
 * source, work_contract are uniform across the whole corpus), so retrieval
 * over ClaudeCodeSession drowns human sessions in templated benchmark ones.
 * Precedence: CLAUDE_CODE_ENTRYPOINT env when the hook process sees it
 * ('cli' = interactive, anything else = automated), else a prompt-shape
 * heuristic. session_kind_source records which rule fired so the tag is
 * revisable; entrypoint is stored verbatim as its own fact when present.
 */
export function classifySessionKind(
  initialPrompt: string | undefined,
  entrypoint: string | undefined,
): { session_kind: 'interactive' | 'automated'; session_kind_source: string } {
  if (entrypoint) {
    return { session_kind: entrypoint === 'cli' ? 'interactive' : 'automated', session_kind_source: 'entrypoint' };
  }
  // ponytail: heuristic-v2 — templated agent prompts start "You are …" (live
  // corpus: "You are a…", "You are solving…", "You are independently…") or hit
  // the upstream 4000-char initial_prompt cap; widen only if mistags show up.
  const automated = initialPrompt !== undefined &&
    (/^you are\b/i.test(initialPrompt) || initialPrompt.length >= 3900);
  return { session_kind: automated ? 'automated' : 'interactive', session_kind_source: 'heuristic-v2' };
}

export function buildSessionKindOp(
  sessionNodeId: string,
  initialPrompt: string | undefined,
  entrypoint: string | undefined,
): GraphOp {
  const kind = classifySessionKind(initialPrompt, entrypoint);
  const properties: Record<string, KfdbValue> = {
    session_kind: str(kind.session_kind),
    session_kind_source: str(kind.session_kind_source),
  };
  if (entrypoint) properties.entrypoint = str(entrypoint);
  return { operation: 'create_node', id: sessionNodeId, label: 'ClaudeCodeSession', mode: 'merge', properties };
}

export function batchOperations(operations: GraphOp[]): GraphOp[][] {
  const batches: GraphOp[][] = [];
  for (let offset = 0; offset < operations.length; offset += BATCH_SIZE) {
    batches.push(operations.slice(offset, offset + BATCH_SIZE));
  }
  return batches;
}
