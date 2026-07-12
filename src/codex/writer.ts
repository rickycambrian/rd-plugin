import type { RdConfig } from '../lib/config.js';
import type { DeriveHeaders } from '../lib/derive.js';
import { batchOperations } from '../lib/graph.js';
import { postJson } from '../lib/http.js';
import { enqueue } from '../lib/queue.js';
import { log } from '../lib/log.js';
import type { CodexPendingEvent } from './event.js';
import { buildCodexTraces } from './trace.js';
import { buildCodexGraphOperations } from './graph.js';
import { writeCodexSpool } from './spool.js';

export interface CodexDirectUnitInput {
  config: RdConfig;
  walletAddress: string;
  agentId: string;
  apiKey: string;
  deriveHeaders?: DeriveHeaders;
  codexSessionId: string;
  events: CodexPendingEvent[];
}

export interface CodexDirectUnitResult {
  ops: number;
  graphOk: boolean;
}

/**
 * Write one Codex flush unit to the direct sink: schema-v3 CodexSession-family
 * graph ops (batched, S2D-authed, D6 session-link included). Failed batches are
 * queued for a later drain. Unlike the Claude path, the superseded legacy
 * `/api/v1/plugin/*` stream (AgentChatSession family) is NOT written — the
 * CodexSession family replaces it (SPEC-000 WS-F ruling, Option A).
 */
export async function writeCodexDirectUnit(input: CodexDirectUnitInput): Promise<CodexDirectUnitResult> {
  const { config, walletAddress, agentId, apiKey, deriveHeaders, codexSessionId, events } = input;
  const traces = buildCodexTraces({ walletAddress, agentId, codexSessionId, events });
  const operations = buildCodexGraphOperations(walletAddress, traces);
  const writeUrl = `${config.api_url.replace(/\/$/, '')}/api/v1/write`;

  let graphOk = true;
  for (const batch of batchOperations(operations)) {
    const body = { operations: batch, skip_embedding: true };
    if (!deriveHeaders) {
      enqueue({ url: writeUrl, body, requiresBearer: true, requiresDerive: true });
      graphOk = false;
      continue;
    }
    try {
      const result = await postJson(writeUrl, body, { Authorization: `Bearer ${apiKey}`, ...deriveHeaders }, 20000);
      if (!result.ok) {
        enqueue({ url: writeUrl, body, requiresBearer: true, requiresDerive: true });
        graphOk = false;
        log('warn', 'codex graph batch failed; queued', { sessionId: codexSessionId, status: result.status });
      }
    } catch (err) {
      enqueue({ url: writeUrl, body, requiresBearer: true, requiresDerive: true });
      graphOk = false;
      log('warn', 'codex graph batch error; queued', { sessionId: codexSessionId, error: (err as Error).message });
    }
  }

  return { ops: operations.length, graphOk };
}

export interface CodexGatewayUnitInput {
  spoolDir: string;
  walletAddress: string;
  agentId: string;
  codexSessionId: string;
  events: CodexPendingEvent[];
}

/** Write one Codex flush unit to the gateway sink as spool files (no network). */
export function writeCodexGatewayUnit(input: CodexGatewayUnitInput): string[] {
  const traces = buildCodexTraces({
    walletAddress: input.walletAddress,
    agentId: input.agentId,
    codexSessionId: input.codexSessionId,
    events: input.events,
  });
  return writeCodexSpool(input.spoolDir, traces);
}
