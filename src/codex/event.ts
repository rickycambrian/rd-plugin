import type { CodexHookEventRecord } from 'rickydata/kfdb';
import type { HookInput } from '../lib/hook-input.js';

const MAX_STRING = 32000;

function truncate(value: string): string {
  return value.length <= MAX_STRING ? value : `${value.slice(0, MAX_STRING)}...[truncated ${value.length - MAX_STRING} chars]`;
}

function str(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

/** Bound the size/shape of arbitrary tool payloads before persisting them. */
export function compactPayload(value: unknown): unknown {
  if (typeof value === 'string') return truncate(value);
  if (Array.isArray(value)) return value.slice(0, 50).map(compactPayload);
  if (!isRecord(value)) return value;
  const output: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value).slice(0, 100)) output[key] = compactPayload(item);
  return output;
}

/**
 * A pending Codex record is a CodexHookEventRecord plus the owned-repo context
 * resolved at capture time. The repo fields are retained for debuggability and
 * legacy-record parity; they are NOT forwarded into the schema-v3 trace (which
 * takes exactly the CodexHookEventRecord shape). `sequence` is the line index in
 * the pending log.
 */
export type CodexPendingEvent = CodexHookEventRecord & {
  repoOwner?: string;
  repoId?: string;
  repoFullName?: string;
};

/**
 * Project a raw Codex hook stdin object into a normalized CodexPendingEvent.
 * Fast + allocation-light — this runs on the session hot path in codex-capture.
 * Codex passes `turn_id` (Claude Code does not); everything else mirrors the
 * Claude event projection.
 */
export function toCodexPendingEvent(
  input: HookInput,
  sequence: number,
  repo: { owner: string; repository: string },
): CodexPendingEvent {
  const promptStr = str(input.prompt);
  const lastAssistant = input.last_assistant_message;
  const toolInput = isRecord(input.tool_input) ? input.tool_input : undefined;
  return {
    sequence,
    hookEventName: str(input.hook_event_name) ?? 'Unknown',
    codexSessionId: str(input.session_id) ?? 'unknown',
    turnId: str(input.turn_id),
    model: str(input.model),
    cwd: str(input.cwd),
    receivedAt: Date.now(),
    prompt: promptStr === undefined ? undefined : truncate(promptStr),
    lastAssistantMessage:
      typeof lastAssistant === 'string' ? truncate(lastAssistant) : lastAssistant === null ? null : undefined,
    stopHookActive: typeof input.stop_hook_active === 'boolean' ? input.stop_hook_active : undefined,
    toolName: str(input.tool_name),
    toolUseId: str(input.tool_use_id),
    toolInput: toolInput === undefined ? undefined : compactPayload(toolInput),
    toolResponse: input.tool_response === undefined ? undefined : compactPayload(input.tool_response),
    repoOwner: repo.owner,
    repoId: repo.repository,
    repoFullName: `${repo.owner}/${repo.repository}`,
  };
}

/** Normalize an already-persisted Codex pending record (re-read safety). */
export function normalizeCodexPendingEvent(raw: unknown, index: number): CodexPendingEvent {
  const e = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  return {
    sequence: typeof e.sequence === 'number' ? e.sequence : index,
    hookEventName: str(e.hookEventName) ?? 'Unknown',
    codexSessionId: str(e.codexSessionId) ?? 'unknown',
    turnId: str(e.turnId),
    model: str(e.model),
    cwd: str(e.cwd),
    receivedAt: typeof e.receivedAt === 'number' ? e.receivedAt : Date.now(),
    prompt: str(e.prompt),
    lastAssistantMessage:
      typeof e.lastAssistantMessage === 'string' ? e.lastAssistantMessage : e.lastAssistantMessage === null ? null : undefined,
    stopHookActive: typeof e.stopHookActive === 'boolean' ? e.stopHookActive : undefined,
    toolName: str(e.toolName),
    toolUseId: str(e.toolUseId),
    toolInput: e.toolInput,
    toolResponse: e.toolResponse,
    repoOwner: str(e.repoOwner),
    repoId: str(e.repoId),
    repoFullName: str(e.repoFullName),
  };
}

/** The CodexHookEventRecord fields only — repo context stripped for the SDK trace. */
export function toTraceEvent(e: CodexPendingEvent): CodexHookEventRecord {
  return {
    sequence: e.sequence,
    hookEventName: e.hookEventName,
    codexSessionId: e.codexSessionId,
    turnId: e.turnId,
    model: e.model,
    cwd: e.cwd,
    receivedAt: e.receivedAt,
    prompt: e.prompt,
    lastAssistantMessage: e.lastAssistantMessage,
    stopHookActive: e.stopHookActive,
    toolName: e.toolName,
    toolUseId: e.toolUseId,
    toolInput: e.toolInput,
    toolResponse: e.toolResponse,
  };
}
