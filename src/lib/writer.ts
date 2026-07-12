import type { RdConfig } from './config.js';
import type { PendingEvent } from './event.js';
import type { TranscriptSummary } from './transcript.js';
import type { DeriveHeaders } from './derive.js';
import { buildTraces } from './trace.js';
import { buildGraphOperations, batchOperations } from './graph.js';
import { writeSpool } from './spool.js';
import { writeLegacyStream } from './legacy-stream.js';
import { postJson } from './http.js';
import { enqueue } from './queue.js';
import { log } from './log.js';

export interface DirectUnitInput {
  config: RdConfig;
  walletAddress: string;
  apiKey: string;
  deriveHeaders?: DeriveHeaders;
  claudeSessionId: string;
  events: PendingEvent[];
  summary?: TranscriptSummary;
  transcriptPath?: string;
  legacyStreamMaxSequence: number;
  /** Highest session_end counts previously sent for this session (monotonic floor). */
  priorMessageCount?: number;
  priorToolCallCount?: number;
}

export interface DirectUnitResult {
  ops: number;
  graphOk: boolean;
  messages: number;
  tools: number;
  maxSequence: number;
  legacyOk: boolean;
  /** New session_end count floor to persist (never lower than the prior floor). */
  sessionMessageCount: number;
  sessionToolCallCount: number;
}

/**
 * Write one flush unit to the direct sink: schema-v3 graph ops (batched,
 * S2D-authed, session-link included) plus the legacy stream. Failed graph
 * batches are queued; the legacy writer queues its own failed posts. Without
 * derive headers, graph ops are queued for a later drain and legacy is skipped.
 */
export async function writeDirectUnit(input: DirectUnitInput): Promise<DirectUnitResult> {
  const { config, walletAddress, apiKey, deriveHeaders, claudeSessionId, events, summary, transcriptPath } = input;
  const traces = buildTraces({ walletAddress, claudeSessionId, events, summary });
  const operations = buildGraphOperations(walletAddress, traces);
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
        log('warn', 'graph batch failed; queued', { sessionId: claudeSessionId, status: result.status });
      }
    } catch (err) {
      enqueue({ url: writeUrl, body, requiresBearer: true, requiresDerive: true });
      graphOk = false;
      log('warn', 'graph batch error; queued', { sessionId: claudeSessionId, error: (err as Error).message });
    }
  }

  let messages = 0;
  let tools = 0;
  let maxSequence = input.legacyStreamMaxSequence;
  let legacyOk = false;
  // Default the persisted floor to the prior floor so a skipped/failed legacy
  // write never lowers the recorded counts.
  let sessionMessageCount = input.priorMessageCount ?? 0;
  let sessionToolCallCount = input.priorToolCallCount ?? 0;
  if (deriveHeaders) {
    try {
      const result = await writeLegacyStream(
        { apiUrl: config.api_url, apiKey, deriveHeaders, trackMessages: config.track_messages, trackFiles: config.track_files, trackGit: config.track_git },
        claudeSessionId,
        events,
        input.legacyStreamMaxSequence,
        summary,
        transcriptPath,
        { messageCount: input.priorMessageCount, toolCallCount: input.priorToolCallCount },
      );
      messages = result.messages;
      tools = result.tools;
      maxSequence = result.maxSequence;
      sessionMessageCount = result.sessionMessageCount;
      sessionToolCallCount = result.sessionToolCallCount;
      legacyOk = true;
    } catch (err) {
      log('warn', 'legacy stream failed', { sessionId: claudeSessionId, error: (err as Error).message });
    }
  }

  return { ops: operations.length, graphOk, messages, tools, maxSequence, legacyOk, sessionMessageCount, sessionToolCallCount };
}

export interface GatewayUnitInput {
  spoolDir: string;
  walletAddress: string;
  claudeSessionId: string;
  events: PendingEvent[];
  summary?: TranscriptSummary;
}

/** Write one flush unit to the gateway sink as spool files (no network). */
export function writeGatewayUnit(input: GatewayUnitInput): string[] {
  const traces = buildTraces({
    walletAddress: input.walletAddress,
    claudeSessionId: input.claudeSessionId,
    events: input.events,
    summary: input.summary,
  });
  return writeSpool(input.spoolDir, traces);
}
