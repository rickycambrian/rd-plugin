/**
 * Claude Code passes a JSON event on stdin for every hook invocation. Fields
 * vary by event but include a subset of: session_id, transcript_path,
 * hook_event_name, tool_name, tool_input, tool_response, prompt, cwd, model,
 * source, reason, stop_hook_active, permission_decision.
 */
export interface HookInput {
  session_id?: string;
  transcript_path?: string;
  hook_event_name?: string;
  tool_name?: string;
  tool_input?: unknown;
  tool_response?: unknown;
  tool_output?: unknown;
  prompt?: string;
  cwd?: string;
  model?: string;
  source?: string;
  reason?: string;
  stop_hook_active?: boolean;
  last_assistant_message?: string | null;
  tool_use_id?: string;
  permission_decision?: string;
  permission_decision_reason?: string;
  [key: string]: unknown;
}

export async function readHookInput(): Promise<HookInput> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as string));
  }
  const raw = Buffer.concat(chunks).toString('utf8').trim();
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as HookInput) : {};
  } catch {
    return {};
  }
}
