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

/**
 * The claude session id for a hook event. Prefer the harness-provided
 * session_id; when it is absent fall back to the session UUID in the transcript
 * path basename (`<uuid>.jsonl`), and only then to the literal 'unknown'.
 * A missing session_id would otherwise collapse every such session onto one
 * deterministic graph-node id — the transcript basename is the same UUID Claude
 * Code names the session, so it keeps distinct sessions distinct.
 */
export function resolveClaudeSessionId(input: HookInput): string {
  if (typeof input.session_id === 'string' && input.session_id) return input.session_id;
  if (typeof input.transcript_path === 'string' && input.transcript_path) {
    const base = input.transcript_path.split(/[\\/]/).pop()?.replace(/\.jsonl$/i, '');
    if (base) return base;
  }
  return 'unknown';
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
