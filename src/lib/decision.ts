import type { HookInput } from './hook-input.js';

export interface ObservableDecisionFields {
  decisionKind: 'ask_user' | 'tool_permission';
  decisionQuestion: string;
  decisionOptions: string[];
  decisionAnswer?: string;
  decisionPolicyRef?: string;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined;
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function optionLabels(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (typeof item === 'string' && item) return [item];
    const row = record(item);
    if (!row) return [];
    const label = stringValue(row.label) ?? stringValue(row.value) ?? stringValue(row.type) ?? stringValue(row.name);
    return label ? [label] : [];
  });
}

function answerText(response: unknown): string | undefined {
  if (typeof response === 'string') return response;
  const row = record(response);
  if (!row) return undefined;
  const direct = stringValue(row.answer) ?? stringValue(row.selected) ?? stringValue(row.decision);
  if (direct) return direct;
  const answers = record(row.answers);
  if (!answers) return undefined;
  const values = Object.values(answers).flatMap((value) => {
    if (typeof value === 'string') return [value];
    if (Array.isArray(value)) return value.filter((item): item is string => typeof item === 'string');
    return [];
  });
  return values.length > 0 ? values.join('\n') : undefined;
}

/** Project only human-observable questions/options/rulings; never hidden reasoning. */
export function observableDecisionFields(input: HookInput, toolResponse: unknown): ObservableDecisionFields | undefined {
  const toolName = stringValue(input.tool_name) ?? '';
  if (/askuser|ask_user/i.test(toolName)) {
    const toolInput = record(input.tool_input);
    const questions = Array.isArray(toolInput?.questions) ? toolInput.questions : [];
    const questionRows = questions.map(record).filter((row): row is Record<string, unknown> => Boolean(row));
    const question = questionRows.map((row) => stringValue(row.question)).filter(Boolean).join('\n')
      || stringValue(toolInput?.question)
      || 'Human input requested';
    const options = questionRows.flatMap((row) => optionLabels(row.options));
    if (options.length === 0) options.push(...optionLabels(toolInput?.options));
    return {
      decisionKind: 'ask_user',
      decisionQuestion: question,
      decisionOptions: [...new Set(options)],
      ...(answerText(toolResponse) ? { decisionAnswer: answerText(toolResponse) } : {}),
    };
  }

  const hookName = stringValue(input.hook_event_name) ?? '';
  const permissionDecision = stringValue(input.permission_decision);
  if (/permission/i.test(hookName) || permissionDecision) {
    const question = stringValue(input.permission_prompt)
      ?? stringValue(input.question)
      ?? stringValue(input.reason)
      ?? `Allow ${toolName || 'requested tool'}?`;
    const options = [
      ...optionLabels(input.options),
      ...optionLabels(input.permission_suggestions),
    ];
    return {
      decisionKind: 'tool_permission',
      decisionQuestion: question,
      decisionOptions: [...new Set(options)],
      ...(permissionDecision ? { decisionAnswer: permissionDecision } : {}),
      ...(stringValue(input.permission_decision_reason) ? { decisionPolicyRef: stringValue(input.permission_decision_reason) } : {}),
    };
  }
  return undefined;
}
