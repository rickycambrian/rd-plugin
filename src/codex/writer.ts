import type { RdConfig } from '../lib/config.js';
import { kfdbAuthHeaders, type KfdbAuth } from '../lib/kfdb-auth.js';
import { batchOperations, GRAPH_WRITE_TIMEOUT_MS } from '../lib/graph.js';
import { postJson } from '../lib/http.js';
import { enqueue } from '../lib/queue.js';
import { log } from '../lib/log.js';
import type { CodexPendingEvent } from './event.js';
import { buildCodexTraces } from './trace.js';
import { buildCodexGraphWriteBundle } from './graph.js';
import { writeContentArtifacts } from '../lib/artifacts.js';
import { writeCodexSpool } from './spool.js';

export interface CodexDirectUnitInput {
  config: RdConfig;
  walletAddress: string;
  agentId: string;
  auth: KfdbAuth;
  codexSessionId: string;
  events: CodexPendingEvent[];
  afterSequence?: number;
}

export interface CodexDirectUnitResult {
  ops: number;
  graphOk: boolean;
  artifactOk: boolean;
  artifacts: number;
}

/**
 * Write one Codex flush unit to the direct sink: schema-v3 CodexSession-family
 * graph ops (batched, S2D-authed, D6 session-link included). Failed batches are
 * queued for a later drain. Unlike the Claude path, the superseded legacy
 * `/api/v1/plugin/*` stream (AgentChatSession family) is NOT written — the
 * CodexSession family replaces it (SPEC-000 WS-F ruling, Option A).
 */
export async function writeCodexDirectUnit(input: CodexDirectUnitInput): Promise<CodexDirectUnitResult> {
  const { config, walletAddress, agentId, auth, codexSessionId, events, afterSequence } = input;
  const deriveHeaders = auth.deriveHeaders;
  const traces = buildCodexTraces({ walletAddress, agentId, codexSessionId, events }, afterSequence);
  const bundle = buildCodexGraphWriteBundle(walletAddress, traces);
  const operations = bundle.operations;
  const writeUrl = `${config.api_url.replace(/\/$/, '')}/api/v1/write`;

  const artifactResult = await writeContentArtifacts(config, auth, bundle.contentArtifacts);

  let graphOk = true;
  const batches = batchOperations(operations);
  for (let i = 0; i < batches.length; i++) {
    const body = { operations: batches[i], skip_embedding: true };
    // Cumulative per session — keyed enqueue replaces the stale copy (see
    // lib/writer.ts) instead of duplicating the batch on every failed flush.
    const dedupeKey = `codex-graph:${codexSessionId}:${i}`;
    if (!deriveHeaders) {
      enqueue({ url: writeUrl, body, requiresBearer: true, requiresDerive: true, dedupeKey });
      graphOk = false;
      continue;
    }
    try {
      const result = await postJson(writeUrl, body, kfdbAuthHeaders(auth, 'POST', writeUrl), GRAPH_WRITE_TIMEOUT_MS);
      if (!result.ok) {
        enqueue({ url: writeUrl, body, requiresBearer: true, requiresDerive: true, dedupeKey });
        graphOk = false;
        log('warn', 'codex graph batch failed; queued', { sessionId: codexSessionId, status: result.status });
      }
    } catch (err) {
      enqueue({ url: writeUrl, body, requiresBearer: true, requiresDerive: true, dedupeKey });
      graphOk = false;
      log('warn', 'codex graph batch error; queued', { sessionId: codexSessionId, error: (err as Error).message });
    }
  }

  return { ops: operations.length, graphOk, artifactOk: artifactResult.ok, artifacts: artifactResult.attempted };
}

export interface CodexGatewayUnitInput {
  spoolDir: string;
  walletAddress: string;
  agentId: string;
  codexSessionId: string;
  events: CodexPendingEvent[];
  afterSequence?: number;
}

/** Write one Codex flush unit to the gateway sink as spool files (no network). */
export function writeCodexGatewayUnit(input: CodexGatewayUnitInput): string[] {
  const traces = buildCodexTraces({
    walletAddress: input.walletAddress,
    agentId: input.agentId,
    codexSessionId: input.codexSessionId,
    events: input.events,
  }, input.afterSequence);
  return writeCodexSpool(input.spoolDir, traces);
}
