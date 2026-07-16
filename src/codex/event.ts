import type { CodexHookEventRecord } from 'rickydata/kfdb';
import type { HookInput } from '../lib/hook-input.js';
import { observableDecisionFields } from '../lib/decision.js';
import {
  buildWorkProvenance, normalizeWorkProvenance, sdkHookPayload, sdkWorkContractRef,
  workProvenanceRefs, type WorkProvenanceEnvelope,
} from '../lib/work-provenance.js';
import type { OwnedRepository } from './repo.js';

function str(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

/** Bound the size/shape of arbitrary tool payloads before persisting them. */
export function compactPayload(value: unknown): unknown {
  return value;
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
  repoRemoteUrl?: string;
  repoBranch?: string;
  repoCommitSha?: string;
  repoTreeHash?: string;
  repoDirty?: boolean;
  repoDirtyStateHash?: string;
  workProvenance?: WorkProvenanceEnvelope;
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
  repo: OwnedRepository,
): CodexPendingEvent {
  const promptStr = str(input.prompt);
  const lastAssistant = input.last_assistant_message;
  const toolInput = isRecord(input.tool_input) ? input.tool_input : undefined;
  const toolResponse = input.tool_response;
  const decision = observableDecisionFields(input, toolResponse);
  const provenanceRefs = workProvenanceRefs(input);
  return {
    sequence,
    hookEventName: str(input.hook_event_name) ?? 'Unknown',
    codexSessionId: str(input.session_id) ?? 'unknown',
    turnId: str(input.turn_id),
    model: str(input.model),
    cwd: str(input.cwd),
    receivedAt: Date.now(),
    prompt: promptStr,
    lastAssistantMessage:
      typeof lastAssistant === 'string' ? lastAssistant : lastAssistant === null ? null : undefined,
    stopHookActive: typeof input.stop_hook_active === 'boolean' ? input.stop_hook_active : undefined,
    toolName: str(input.tool_name),
    toolUseId: str(input.tool_use_id),
    toolInput: toolInput === undefined ? undefined : compactPayload(toolInput),
    toolResponse: toolResponse === undefined ? undefined : compactPayload(toolResponse),
    hookPayload: input,
    ...decision,
    repoOwner: repo.owner,
    repoId: repo.repository,
    repoFullName: `${repo.owner}/${repo.repository}`,
    repoRemoteUrl: repo.remoteUrl,
    repoBranch: repo.branch,
    repoCommitSha: repo.commitSha,
    repoTreeHash: repo.treeHash,
    repoDirty: repo.dirty,
    repoDirtyStateHash: repo.dirtyStateHash,
    repository: {
      owner: repo.owner, repository: repo.repository, fullName: `${repo.owner}/${repo.repository}`,
      remoteUrl: repo.remoteUrl, branch: repo.branch, commitSha: repo.commitSha,
      treeHash: repo.treeHash, dirty: repo.dirty,
      dirtyStateHash: repo.dirtyStateHash as `sha256:${string}` | undefined,
    },
    workProvenance: buildWorkProvenance(input, sequence, repo),
    workContract: sdkWorkContractRef(provenanceRefs),
    sourceIntentRef: provenanceRefs.sourceIntentRef,
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
    hookPayload: e.hookPayload,
    decisionKind: e.decisionKind === 'ask_user' || e.decisionKind === 'tool_permission' ? e.decisionKind : undefined,
    decisionQuestion: str(e.decisionQuestion),
    decisionOptions: Array.isArray(e.decisionOptions) ? e.decisionOptions.filter((item): item is string => typeof item === 'string') : undefined,
    decisionAnswer: str(e.decisionAnswer),
    decisionPolicyRef: str(e.decisionPolicyRef),
    repoOwner: str(e.repoOwner),
    repoId: str(e.repoId),
    repoFullName: str(e.repoFullName),
    repoRemoteUrl: str(e.repoRemoteUrl),
    repoBranch: str(e.repoBranch),
    repoCommitSha: str(e.repoCommitSha),
    repoTreeHash: str(e.repoTreeHash),
    repoDirty: typeof e.repoDirty === 'boolean' ? e.repoDirty : undefined,
    repoDirtyStateHash: str(e.repoDirtyStateHash),
    workProvenance: normalizeWorkProvenance(e.workProvenance),
    workContract: e.workContract && typeof e.workContract === 'object'
      ? e.workContract as CodexPendingEvent['workContract']
      : undefined,
    sourceIntentRef: str(e.sourceIntentRef),
    repository: e.repository && typeof e.repository === 'object'
      ? e.repository as CodexPendingEvent['repository']
      : undefined,
    contextDelivery: e.contextDelivery && typeof e.contextDelivery === 'object'
      ? e.contextDelivery as CodexPendingEvent['contextDelivery']
      : undefined,
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
    hookPayload: sdkHookPayload(e.hookPayload, e.workProvenance),
    decisionKind: e.decisionKind,
    decisionQuestion: e.decisionQuestion,
    decisionOptions: e.decisionOptions,
    decisionAnswer: e.decisionAnswer,
    decisionPolicyRef: e.decisionPolicyRef,
    contextDelivery: e.contextDelivery,
    repository: e.repoFullName ? {
      owner: e.repoOwner ?? '', repository: e.repoId ?? '', fullName: e.repoFullName,
      remoteUrl: e.repoRemoteUrl ?? '', branch: e.repoBranch, commitSha: e.repoCommitSha,
      treeHash: e.repoTreeHash, dirty: e.repoDirty,
      dirtyStateHash: e.repoDirtyStateHash as `sha256:${string}` | undefined,
    } : undefined,
    workContract: e.workContract,
    sourceIntentRef: e.sourceIntentRef,
  };
}
