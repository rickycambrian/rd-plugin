import type { ClaudeCodeHookEventRecord } from 'rickydata/kfdb';
import type { HookInput } from './hook-input.js';

const MAX_STRING = 32000;

function truncate(value: string): string {
  return value.length <= MAX_STRING ? value : `${value.slice(0, MAX_STRING)}...[truncated ${value.length - MAX_STRING} chars]`;
}

function str(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

/**
 * A pending record is a ClaudeCodeHookEventRecord plus the extra fields the
 * flush stage needs that the SDK trace type does not model (the last assistant
 * message Claude Code hands to the Stop hook, used for the legacy stream). It is
 * the JSON shape appended one-per-line to the pending log by capture and
 * re-hydrated by flush. `sequence` is the line index in the pending log.
 */
export type PendingEvent = ClaudeCodeHookEventRecord & {
  lastAssistantMessage?: string | null;
};

/**
 * Project a raw Claude Code hook stdin object into a normalized PendingEvent.
 * Fast + allocation-light — this runs on the session hot path in capture.
 */
export function toPendingEvent(input: HookInput, sequence: number): PendingEvent {
  const promptStr = str(input.prompt);
  const toolResponse = input.tool_response !== undefined ? input.tool_response : input.tool_output;
  const lastAssistant = input.last_assistant_message;
  return {
    sequence,
    hookEventName: str(input.hook_event_name) ?? 'Unknown',
    claudeSessionId: str(input.session_id) ?? 'unknown',
    transcriptPath: str(input.transcript_path),
    cwd: str(input.cwd),
    model: str(input.model),
    source: str(input.source),
    receivedAt: Date.now(),
    prompt: promptStr === undefined ? undefined : truncate(promptStr),
    reason: str(input.reason),
    stopHookActive: typeof input.stop_hook_active === 'boolean' ? input.stop_hook_active : undefined,
    toolName: str(input.tool_name),
    toolUseId: str(input.tool_use_id),
    toolInput: input.tool_input,
    toolResponse,
    permissionDecision: str(input.permission_decision),
    permissionDecisionReason: str(input.permission_decision_reason),
    lastAssistantMessage:
      typeof lastAssistant === 'string' ? truncate(lastAssistant) : lastAssistant === null ? null : undefined,
  };
}

/** Normalize an already-persisted pending record (backfill / re-read safety). */
export function normalizePendingEvent(raw: unknown, index: number): PendingEvent {
  const e = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  return {
    sequence: typeof e.sequence === 'number' ? e.sequence : index,
    hookEventName: str(e.hookEventName) ?? 'Unknown',
    claudeSessionId: str(e.claudeSessionId) ?? 'unknown',
    transcriptPath: str(e.transcriptPath),
    cwd: str(e.cwd),
    model: str(e.model),
    source: str(e.source),
    receivedAt: typeof e.receivedAt === 'number' ? e.receivedAt : Date.now(),
    prompt: str(e.prompt),
    reason: str(e.reason),
    stopHookActive: typeof e.stopHookActive === 'boolean' ? e.stopHookActive : undefined,
    toolName: str(e.toolName),
    toolUseId: str(e.toolUseId),
    toolInput: e.toolInput,
    toolResponse: e.toolResponse,
    permissionDecision: str(e.permissionDecision),
    permissionDecisionReason: str(e.permissionDecisionReason),
    lastAssistantMessage:
      typeof e.lastAssistantMessage === 'string' ? e.lastAssistantMessage : e.lastAssistantMessage === null ? null : undefined,
  };
}
