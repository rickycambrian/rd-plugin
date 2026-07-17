import type { ClaudeCodeHookTrace, RepositorySnapshot } from 'rickydata/kfdb';
import type { PendingEvent } from './event.js';
import type { TranscriptPlan, TranscriptSummary } from './transcript.js';
import { sdkHookPayload } from './work-provenance.js';

/** Stable agent id for Claude Code sessions in the execution graph. */
export const RD_AGENT_ID = process.env.RD_KG_AGENT_ID || 'claude-code';

/**
 * Group a flat event stream into turns. A turn boundary starts at each
 * UserPromptSubmit (mirrors the codex hook grouping): the prompt plus all
 * following tool/stop events up to the next prompt form one turn.
 */
export function groupTurns(events: PendingEvent[]): PendingEvent[][] {
  const groups: PendingEvent[][] = [];
  let current: PendingEvent[] | null = null;
  for (const event of events) {
    // Open a new turn on the first event and at every UserPromptSubmit.
    if (current === null || event.hookEventName === 'UserPromptSubmit') {
      current = [];
      groups.push(current);
    }
    current.push(event);
  }
  return groups.filter((g) => g.length > 0);
}

function firstDefined<T>(values: Array<T | undefined>): T | undefined {
  for (const v of values) if (v !== undefined && v !== null && v !== '') return v;
  return undefined;
}

/**
 * Fallback initial prompt from the captured events: the first UserPromptSubmit's
 * prompt text, sanitized identically to the transcript-derived path
 * (`trim()`, without truncation). Used when the transcript is unavailable/unparseable
 * — notably in the remote gateway workspace, where the transcript JSONL isn't
 * present, so the SDK builder would otherwise omit initial_prompt and break
 * direct-vs-gateway parity. Returns undefined if no UserPromptSubmit carries text.
 */
function firstUserPromptText(events: PendingEvent[]): string | undefined {
  for (const e of events) {
    if (e.hookEventName === 'UserPromptSubmit' && typeof e.prompt === 'string') {
      const text = e.prompt.trim();
      if (text) return text;
    }
  }
  return undefined;
}

export interface BuildTracesInput {
  walletAddress: string;
  claudeSessionId: string;
  events: PendingEvent[];
  summary?: TranscriptSummary;
}

/**
 * Build one ClaudeCodeHookTrace per turn. Session-scoped enrichment
 * (initial_prompt, files_changed, parent_session_id) is attached to every
 * trace: the session node merges across turns, so identical values are
 * idempotent, and any single flushed turn carries the full session context.
 */
export function buildTraces(input: BuildTracesInput): ClaudeCodeHookTrace[] {
  const { walletAddress, claudeSessionId, events, summary } = input;
  const groups = groupTurns(events);
  const sessionModel = firstDefined([summary?.model, ...events.map((e) => e.model)]);
  const sessionCwd = firstDefined([summary?.cwd, ...events.map((e) => e.cwd)]);
  // Transcript wins (it sees the true first prompt across parent sessions); the
  // event fallback keeps the field present when the transcript is unavailable.
  const sessionInitialPrompt = firstDefined([summary?.initialPrompt, firstUserPromptText(events)]);
  return groups.map((group, index) => {
    const turnModel = firstDefined([...group.map((e) => e.model), sessionModel]);
    const turnCwd = firstDefined([...group.map((e) => e.cwd), sessionCwd]);
    const trace: ClaudeCodeHookTrace = {
      walletAddress,
      agentId: RD_AGENT_ID,
      sessionId: claudeSessionId,
      turnIndex: index + 1,
      claudeSessionId,
      model: turnModel,
      cwd: turnCwd,
      startedAt: group[0].receivedAt,
      completedAt: group[group.length - 1].receivedAt,
      events: group.map((event) => ({
        ...event,
        hookPayload: sdkHookPayload(event.hookPayload, event.workProvenance),
      })),
    };
    if (sessionInitialPrompt !== undefined) trace.initialPrompt = sessionInitialPrompt;
    if (summary?.filesChanged !== undefined) trace.filesChanged = summary.filesChanged;
    if (summary?.parentSessionId !== undefined) trace.parentSessionId = summary.parentSessionId;
    // Ride plans on the trace for spool/gateway parity: SDK >=1.16 emits Plan
    // ops from trace.plans (same ids as our plan.ts). Vendored 1.13.2 ignores
    // the extra field, so the direct sink keeps emitting plan ops itself.
    if (summary?.plans?.length) (trace as ClaudeCodeHookTrace & { plans?: TranscriptPlan[] }).plans = summary.plans;
    const repository = group.find((event) => event.repository)?.repository;
    if (repository?.fullName !== undefined) trace.repository = repository as RepositorySnapshot;
    const baseRepository = group.find((event) => event.repository?.fullName)?.repository;
    const resultRepository = [...group].reverse().find((event) => event.repository?.fullName)?.repository;
    if (baseRepository?.fullName) trace.baseRepository = baseRepository as RepositorySnapshot;
    if (resultRepository?.fullName) trace.resultRepository = resultRepository as RepositorySnapshot;
    const workContract = group.find((event) => event.workContract)?.workContract;
    const sourceIntentRef = firstDefined(group.map((event) => event.sourceIntentRef));
    if (workContract) trace.workContract = workContract;
    if (sourceIntentRef) trace.sourceIntentRef = sourceIntentRef;
    return trace;
  });
}
