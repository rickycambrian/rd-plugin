import type { HookInput } from './hook-input.js';
import { workProvenanceRefs } from './work-provenance.js';

function str(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function exactText(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined;
}

function nested(input: HookInput): Record<string, unknown> {
  const value = input.work_context ?? input.rickydata_work;
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export interface TaskContextDescriptor {
  query: string;
  taskSlug?: string;
  context: Record<string, unknown>;
}

/** Pure projection used by the UserPromptSubmit task-context hook. */
export function taskContextDescriptor(
  input: HookInput,
  repoId: string,
  env: NodeJS.ProcessEnv = process.env,
): TaskContextDescriptor | null {
  if (input.hook_event_name !== 'UserPromptSubmit') return null;
  const query = exactText(input.prompt);
  if (!query) return null;
  const refs = workProvenanceRefs(input, env);
  const details = nested(input);
  const taskSlug = str(input.task_slug) ?? str(input.taskSlug) ?? str(details.task_slug) ?? str(details.taskSlug)
    ?? str(env.RICKYDATA_TASK_SLUG);
  return {
    query,
    ...(taskSlug ? { taskSlug } : {}),
    context: {
      repo_id: repoId,
      ...(refs.sourceIntentRef ? { source_intent_ref: refs.sourceIntentRef } : {}),
      ...(refs.workContractId ? { work_contract_id: refs.workContractId } : {}),
      ...(refs.workContractHash ? { work_contract_hash: refs.workContractHash } : {}),
      ...(refs.oracleRef ? { oracle_ref: refs.oracleRef } : {}),
    },
  };
}
