import { kfdbAuthHeaders, type KfdbAuth } from './kfdb-auth.js';
import { postJson } from './http.js';
import { log } from './log.js';

/**
 * Best-effort semantic embedding of just-written graph nodes.
 *
 * Graph writes go out with skip_embedding:true on purpose: the server's
 * auto-embed path keys off a text-property allow-list, which would embed junk
 * (ClaudeCodeToolUse.tool_name, CodeFile paths) at 2 Gemini calls per node and
 * still miss ClaudeCodeSession.initial_prompt (not on the allow-list). Instead
 * we pick the nodes with real semantic value and embed them explicitly via
 * /api/v1/entities/embed/batch, passing the text so the server never has to
 * re-read (or fail to find) the node.
 */

const EMBED_TEXT_MAX = 30_000; // matches server MAX_EMBED_CHARS (~7.5k tokens of the embedder's 8192-token window)
const EMBED_BATCH_MAX = 100; // server rejects larger batches
const EMBED_TIMEOUT_MS = 60_000;

/** label → node property whose text is worth a semantic embedding. */
const EMBED_TEXT_PROPERTY: Record<string, string> = {
  Plan: 'content',
  ClaudeCodeSession: 'initial_prompt',
  CodeCommand: 'command_preview',
};

export interface EmbedTarget {
  label: string;
  node_id: string;
  text: string;
}

/**
 * Pull embeddable nodes out of graph write ops: create_node ops whose label is
 * mapped above and whose text property is a non-empty string. Deduped by
 * label:id; the last op wins (freshest merge value).
 */
export function collectEmbedTargets(operations: Array<Record<string, unknown>>): EmbedTarget[] {
  const byKey = new Map<string, EmbedTarget>();
  for (const op of operations) {
    if (op.operation !== 'create_node' || typeof op.label !== 'string') continue;
    const prop = EMBED_TEXT_PROPERTY[op.label];
    if (!prop) continue;
    const props = op.properties as Record<string, { String?: unknown } | undefined> | undefined;
    const raw = props?.[prop]?.String;
    if (typeof raw !== 'string' || !raw.trim()) continue;
    byKey.set(`${op.label}:${op.id}`, { label: op.label, node_id: String(op.id), text: raw.slice(0, EMBED_TEXT_MAX) });
  }
  return [...byKey.values()];
}

/**
 * POST targets to /api/v1/entities/embed/batch in ≤100-entity chunks. Requires
 * derive headers (private keyspace); without them, or on failure, this is a
 * no-op/log — never queued, because the next flush of the same session
 * re-embeds the same deterministic ids idempotently.
 */
export async function embedTargets(
  apiUrl: string,
  auth: KfdbAuth,
  targets: EmbedTarget[],
  sessionId?: string,
): Promise<number> {
  if (targets.length === 0 || !auth.deriveHeaders) return 0;
  const url = `${apiUrl.replace(/\/$/, '')}/api/v1/entities/embed/batch`;
  let embedded = 0;
  for (let i = 0; i < targets.length; i += EMBED_BATCH_MAX) {
    const entities = targets.slice(i, i + EMBED_BATCH_MAX);
    try {
      const result = await postJson(url, { entities }, kfdbAuthHeaders(auth, 'POST', url), EMBED_TIMEOUT_MS);
      if (result.ok) embedded += entities.length;
      else log('warn', 'embed batch failed', { sessionId, status: result.status, count: entities.length });
    } catch (err) {
      log('warn', 'embed batch error', { sessionId, error: (err as Error).message, count: entities.length });
    }
  }
  return embedded;
}
