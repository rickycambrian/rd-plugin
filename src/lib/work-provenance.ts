import type { HookInput } from './hook-input.js';
import type { OwnedRepository } from '../codex/repo.js';
import type { WorkContractRef } from 'rickydata/kfdb';

export const WORK_PROVENANCE_SCHEMA_VERSION = 'rickydata.work_provenance.v1' as const;

export interface WorkProvenanceRefs {
  sourceIntentRef?: string;
  workContractId?: string;
  workContractHash?: string;
  oracleRef?: string;
  workContractNodeId?: string;
  workContractSchemaVersion?: string;
}

export interface WorkProvenanceEnvelope {
  schemaVersion: typeof WORK_PROVENANCE_SCHEMA_VERSION;
  repository?: OwnedRepository;
  objective?: WorkProvenanceRefs & {
    text: string;
    observedAt: number;
    promptSequence: number;
  };
  refs?: WorkProvenanceRefs;
  terminal?: {
    event: 'Stop' | 'SessionEnd';
    resultCommitSha?: string;
    resultTreeHash?: string;
    /** Hooks do not expose usage. Unknown must remain null, never synthetic zero. */
    usage: null;
  };
  gitArm?: {
    status: 'started' | 'rejected';
    binary: string;
    diagnosticCode?: 'RICKYGIT_PROVENANCE_PREFLIGHT_REJECTED';
    missingFlags?: string[];
    detail?: string;
  };
  /** Hooks do not expose usage. The execution engine may enrich this later. */
  usage: null;
}

function str(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function exactText(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined;
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

/**
 * Accept refs from Home/Git without requiring their lifecycle types in the
 * capture plugin. Top-level hook fields win, then `work_context` /
 * `rickydata_work`, then environment variables used by local launchers.
 */
export function workProvenanceRefs(input: HookInput, env: NodeJS.ProcessEnv = process.env): WorkProvenanceRefs {
  const nested = { ...record(input.rickydata_work), ...record(input.work_context) };
  const pick = (snake: string, camel: string, envName: string): string | undefined =>
    str(input[snake]) ?? str(input[camel]) ?? str(nested[snake]) ?? str(nested[camel]) ?? str(env[envName]);
  return {
    sourceIntentRef: pick('source_intent_ref', 'sourceIntentRef', 'RICKYDATA_SOURCE_INTENT_REF'),
    workContractId: pick('work_contract_id', 'workContractId', 'RICKYDATA_WORK_CONTRACT_ID'),
    workContractHash: pick('work_contract_hash', 'workContractHash', 'RICKYDATA_WORK_CONTRACT_HASH'),
    oracleRef: pick('oracle_ref', 'oracleRef', 'RICKYDATA_ORACLE_REF'),
    workContractNodeId: pick('work_contract_node_id', 'workContractNodeId', 'RICKYDATA_WORK_CONTRACT_NODE_ID'),
    workContractSchemaVersion: pick('work_contract_schema_version', 'workContractSchemaVersion', 'RICKYDATA_WORK_CONTRACT_SCHEMA_VERSION'),
  };
}

export function sdkWorkContractRef(refs: WorkProvenanceRefs): WorkContractRef | undefined {
  const { workContractId, workContractHash, workContractNodeId, workContractSchemaVersion } = refs;
  if (!workContractId || !workContractHash || !workContractNodeId || !workContractSchemaVersion) return undefined;
  if (!/^sha256:[0-9a-f]{64}$/.test(workContractHash)) return undefined;
  return {
    contractId: workContractId,
    contractHash: workContractHash as `sha256:${string}`,
    nodeId: workContractNodeId,
    schemaVersion: workContractSchemaVersion,
    ...(refs.sourceIntentRef ? { sourceIntentRef: refs.sourceIntentRef } : {}),
  };
}

export function buildWorkProvenance(
  input: HookInput,
  sequence: number,
  repository?: OwnedRepository,
  env: NodeJS.ProcessEnv = process.env,
): WorkProvenanceEnvelope {
  const eventName = str(input.hook_event_name) ?? 'Unknown';
  const refs = workProvenanceRefs(input, env);
  const hasRefs = Object.values(refs).some(Boolean);
  const prompt = eventName === 'UserPromptSubmit' ? exactText(input.prompt) : undefined;
  const terminal = eventName === 'Stop' || eventName === 'SessionEnd'
    ? {
        event: eventName,
        ...(repository?.commitSha ? { resultCommitSha: repository.commitSha } : {}),
        ...(repository?.treeHash ? { resultTreeHash: repository.treeHash } : {}),
        usage: null,
      } as const
    : undefined;
  return {
    schemaVersion: WORK_PROVENANCE_SCHEMA_VERSION,
    ...(repository ? { repository } : {}),
    ...(prompt ? { objective: { text: prompt, observedAt: Date.now(), promptSequence: sequence, ...refs } } : {}),
    ...(hasRefs ? { refs } : {}),
    ...(terminal ? { terminal } : {}),
    usage: null,
  };
}

/**
 * Migration seam for SDK versions that predate work_provenance.v1. The exact
 * hook envelope remains untouched in the pending log; only the SDK-facing copy
 * gains this namespaced field, so graph materialization can be upgraded without
 * re-capturing private prompts or repository baselines.
 */
export function sdkHookPayload(payload: unknown, provenance?: WorkProvenanceEnvelope): unknown {
  if (!provenance) return payload;
  return { ...record(payload), rickydata_work_provenance: provenance };
}

export function normalizeWorkProvenance(value: unknown): WorkProvenanceEnvelope | undefined {
  const item = record(value);
  return item.schemaVersion === WORK_PROVENANCE_SCHEMA_VERSION
    ? item as unknown as WorkProvenanceEnvelope
    : undefined;
}
