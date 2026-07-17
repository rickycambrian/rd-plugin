import type { CodexHookTrace } from 'rickydata/kfdb';
import type { RepositorySnapshot } from 'rickydata/kfdb';
import { type CodexPendingEvent, toTraceEvent } from './event.js';

interface TurnGroup {
  turnId: string | undefined;
  events: CodexPendingEvent[];
}

/**
 * Group a flat Codex event stream into turns by `turn_id`. Consecutive events
 * sharing a turnId form one turn; an event with no turnId continues the current
 * turn (and adopts a turnId once one appears). A new group starts whenever a
 * defined turnId differs from the current group's. Deterministic given the
 * stream — no wall-clock, no ordering ambiguity.
 */
export function groupTurns(events: CodexPendingEvent[]): TurnGroup[] {
  const groups: TurnGroup[] = [];
  for (const event of events) {
    const key = event.turnId;
    const last = groups[groups.length - 1];
    if (last && (key === undefined || last.turnId === key)) {
      if (key !== undefined && last.turnId === undefined) last.turnId = key;
      last.events.push(event);
    } else {
      groups.push({ turnId: key, events: [event] });
    }
  }
  return groups.filter((g) => g.events.length > 0);
}

function firstDefined<T>(values: Array<T | undefined>): T | undefined {
  for (const v of values) if (v !== undefined && v !== null && (v as unknown) !== '') return v;
  return undefined;
}

function repositoryForEvent(event: CodexPendingEvent): RepositorySnapshot | undefined {
  if (event.repository) return event.repository;
  if (!event.repoFullName) return undefined;
  return {
    owner: event.repoOwner ?? '', repository: event.repoId ?? '', fullName: event.repoFullName,
    remoteUrl: event.repoRemoteUrl ?? '', branch: event.repoBranch, commitSha: event.repoCommitSha,
    treeHash: event.repoTreeHash, dirty: event.repoDirty,
    dirtyStateHash: event.repoDirtyStateHash as `sha256:${string}` | undefined,
  };
}

export interface BuildCodexTracesInput {
  walletAddress: string;
  agentId: string;
  codexSessionId: string;
  events: CodexPendingEvent[];
}

/**
 * Build one CodexHookTrace per turn. A turn with no captured turnId is given a
 * stable synthetic id (`<codexSessionId>-turn-<n>`) so its CodexTurn node id is
 * deterministic and idempotent across re-flushes. Session/turn scalars
 * (model, cwd) fall back to session-wide values when a turn omits them.
 */
export function buildCodexTraces(input: BuildCodexTracesInput, afterSequence?: number): CodexHookTrace[] {
  const { walletAddress, agentId, codexSessionId, events } = input;
  const groups = groupTurns(events);
  const sessionModel = firstDefined(events.map((e) => e.model));
  const sessionCwd = firstDefined(events.map((e) => e.cwd));
  return groups.flatMap((group, index) => {
    if (afterSequence !== undefined && !group.events.some((event) => event.sequence > afterSequence)) return [];
    const turnIndex = index + 1;
    const turnId = group.turnId ?? `${codexSessionId}-turn-${turnIndex}`;
    const model = firstDefined([...group.events.map((e) => e.model), sessionModel]);
    const cwd = firstDefined([...group.events.map((e) => e.cwd), sessionCwd]);
    const repoEvent = group.events.find((event) => event.repoFullName);
    const repository = repoEvent?.repoFullName
      ? {
          owner: repoEvent.repoOwner ?? '', repository: repoEvent.repoId ?? '',
          fullName: repoEvent.repoFullName, remoteUrl: repoEvent.repoRemoteUrl ?? '',
          branch: repoEvent.repoBranch, commitSha: repoEvent.repoCommitSha,
        }
      : undefined;
    const trace: CodexHookTrace = {
      walletAddress,
      agentId,
      sessionId: codexSessionId,
      turnIndex,
      codexSessionId,
      turnId,
      model,
      cwd,
      startedAt: group.events[0].receivedAt,
      completedAt: group.events[group.events.length - 1].receivedAt,
      events: group.events.map(toTraceEvent),
      repository,
    };
    const baseRepository = firstDefined(group.events.map(repositoryForEvent));
    const resultRepository = firstDefined([...group.events].reverse().map(repositoryForEvent));
    if (baseRepository) trace.baseRepository = baseRepository;
    if (resultRepository) trace.resultRepository = resultRepository;
    const workContract = group.events.find((event) => event.workContract)?.workContract;
    const sourceIntentRef = firstDefined(group.events.map((event) => event.sourceIntentRef));
    if (workContract) trace.workContract = workContract;
    if (sourceIntentRef) trace.sourceIntentRef = sourceIntentRef;
    return [trace];
  });
}
