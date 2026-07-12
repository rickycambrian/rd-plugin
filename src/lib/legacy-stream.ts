import path from 'node:path';
import { postJson } from './http.js';
import { enqueue } from './queue.js';
import { sha256Hex } from './fsutil.js';
import type { PendingEvent } from './event.js';
import type { DeriveHeaders } from './derive.js';
import type { TranscriptSummary } from './transcript.js';

export interface LegacyStreamConfig {
  apiUrl: string;
  apiKey: string;
  deriveHeaders: DeriveHeaders;
  trackMessages: boolean;
  trackFiles: boolean;
  trackGit: boolean;
}

/** Highest counts previously sent to session_end for this session (the floor). */
export interface LegacyStreamPriorCounts {
  messageCount?: number;
  toolCallCount?: number;
}

export interface LegacyStreamResult {
  messages: number;
  tools: number;
  maxSequence: number;
  /**
   * Highest message_count / tool_call_count now on record at session_end for
   * this session — the new floor the caller must persist so a later re-flush
   * can enforce monotonicity. Equals the prior floor when the re-send was
   * skipped because the recount was lower.
   */
  sessionMessageCount: number;
  sessionToolCallCount: number;
}

function workspaceName(cwd: string | undefined): string {
  if (!cwd) return 'unknown';
  return path.basename(cwd) || cwd;
}

function isoTime(ms: number): string {
  return new Date(ms || Date.now()).toISOString();
}

function summarizePayload(payload: unknown): Record<string, unknown> | null {
  if (payload === undefined || payload === null) return null;
  if (typeof payload === 'string') return { text: payload.slice(0, 2000), length: payload.length };
  const encoded = JSON.stringify(payload) ?? '';
  return { preview: encoded.slice(0, 2000), length: encoded.length, sha256: sha256Hex(encoded) };
}

function extractCommand(input: unknown): string | null {
  if (typeof input === 'string') return input;
  if (!input || typeof input !== 'object') return null;
  const rec = input as Record<string, unknown>;
  for (const key of ['command', 'cmd', 'script']) {
    if (typeof rec[key] === 'string' && rec[key]) return rec[key] as string;
  }
  return null;
}

const GIT_PATTERNS = [
  /^git\s+commit/, /^git\s+push/, /^git\s+pull/, /^git\s+merge/, /^git\s+rebase/,
  /^git\s+checkout/, /^git\s+branch/, /^git\s+tag/, /^git\s+stash/, /^git\s+reset/,
  /^git\s+revert/, /^git\s+cherry-pick/,
];

function isGitOperation(command: string): boolean {
  const trimmed = command.trim();
  return GIT_PATTERNS.some((p) => p.test(trimmed));
}

function parseGitOperation(command: string): string {
  const m = command.match(/^git\s+(\w+)/);
  return m ? m[1] : 'unknown';
}

function extractCommitMessage(command: string): string | null {
  const m = command.match(/-m\s+["']([^"']+)["']/);
  return m ? m[1] : null;
}

function extractCommitHash(output: string): string | null {
  const m = output.match(/\[[\w./-]+\s+([a-f0-9]{7,40})\]/);
  if (m) return m[1];
  const full = output.match(/([a-f0-9]{40})/);
  return full ? full[1] : null;
}

function outputText(response: unknown): string {
  if (typeof response === 'string') return response;
  if (response && typeof response === 'object') {
    const r = response as { stdout?: unknown; stderr?: unknown };
    return `${String(r.stdout ?? '')}\n${String(r.stderr ?? '')}`.trim();
  }
  return '';
}

function successfulToolEvent(event: PendingEvent): boolean | undefined {
  const response = event.toolResponse;
  if (response && typeof response === 'object') {
    const r = response as { success?: unknown; exit_code?: unknown; error?: unknown };
    if (typeof r.success === 'boolean') return r.success;
    if (typeof r.exit_code === 'number') return r.exit_code === 0;
    if (typeof r.error === 'string' && r.error) return false;
  }
  return undefined;
}

async function post(
  cfg: LegacyStreamConfig,
  pathName: string,
  body: Record<string, unknown>,
  queueOnFailure: boolean,
): Promise<boolean> {
  const url = `${cfg.apiUrl.replace(/\/$/, '')}/api/v1/plugin/${pathName}`;
  const headers = { Authorization: `Bearer ${cfg.apiKey}`, ...cfg.deriveHeaders };
  try {
    const result = await postJson(url, body, headers, 15000);
    if (result.ok) return true;
    if (queueOnFailure) enqueue({ url, body, requiresBearer: true, requiresDerive: true });
    return false;
  } catch {
    if (queueOnFailure) enqueue({ url, body, requiresBearer: true, requiresDerive: true });
    return false;
  }
}

function countMessages(events: PendingEvent[]): number {
  return events.filter((e) => e.prompt || e.lastAssistantMessage).length;
}

function countToolCalls(events: PendingEvent[]): number {
  return events.filter((e) => e.toolName && e.hookEventName === 'PostToolUse').length;
}

function outcomeSummary(events: PendingEvent[], summary?: TranscriptSummary): string {
  for (let i = events.length - 1; i >= 0; i--) {
    const text = events[i].lastAssistantMessage;
    if (typeof text === 'string' && text.trim()) return text.trim().slice(0, 1000);
  }
  if (summary?.initialPrompt) return summary.initialPrompt.slice(0, 1000);
  return 'Claude Code session';
}

/**
 * Write the legacy `/api/v1/plugin/*` stream for a session: ensure-session, then
 * per-event track-message / track-tool-call / track-git for events beyond the
 * previously streamed sequence, then session-end. Semantics mirror the existing
 * legacy tracking plugin. Failed posts are queued for the drain.
 */
export async function writeLegacyStream(
  cfg: LegacyStreamConfig,
  claudeSessionId: string,
  events: PendingEvent[],
  startAfterSequence: number,
  summary?: TranscriptSummary,
  transcriptPath?: string,
  prior?: LegacyStreamPriorCounts,
): Promise<LegacyStreamResult> {
  const first = events[0];
  const last = events[events.length - 1];
  const cwd = summary?.cwd || first.cwd || last.cwd || '';
  const workspace = workspaceName(cwd);

  const metadata: Record<string, unknown> = {
    source: 'claude-code-hooks',
    provider: 'claude-code',
    event_count: events.length,
    hook_event_types: [...new Set(events.map((e) => e.hookEventName))],
  };
  if (summary?.parentSessionId) metadata.parent_session_id = summary.parentSessionId;

  await post(cfg, 'ensure-session', {
    session_id: claudeSessionId,
    workspace_name: workspace,
    working_directory: cwd,
    transcript_path: transcriptPath ?? first.transcriptPath ?? null,
    provider: 'claude-code',
    metadata,
  }, false);

  let messages = 0;
  let tools = 0;
  let maxSequence = startAfterSequence;

  for (const event of events) {
    if (event.sequence <= startAfterSequence) continue;
    maxSequence = Math.max(maxSequence, event.sequence);
    const eventWorkspace = workspaceName(event.cwd || cwd);

    if (cfg.trackMessages && event.prompt) {
      await post(cfg, 'track-message', {
        session_id: claudeSessionId,
        role: 'user',
        message_type: 'prompt',
        workspace_name: eventWorkspace,
        timestamp: isoTime(event.receivedAt),
        content: event.prompt,
        metadata: { event: event.hookEventName, char_count: event.prompt.length, sequence: event.sequence, source: 'claude-code-hooks' },
      }, true);
      messages += 1;
    }

    if (cfg.trackMessages && typeof event.lastAssistantMessage === 'string' && event.lastAssistantMessage.trim()) {
      await post(cfg, 'track-message', {
        session_id: claudeSessionId,
        role: 'assistant',
        message_type: 'response',
        workspace_name: eventWorkspace,
        timestamp: isoTime(event.receivedAt),
        content: event.lastAssistantMessage,
        metadata: { event: event.hookEventName, char_count: event.lastAssistantMessage.length, sequence: event.sequence, source: 'claude-code-hooks' },
      }, true);
      messages += 1;
    }

    if (event.toolName && event.hookEventName === 'PostToolUse') {
      await post(cfg, 'track-tool-call', {
        session_id: claudeSessionId,
        tool_name: event.toolName,
        workspace_name: eventWorkspace,
        timestamp: isoTime(event.receivedAt),
        input_summary: summarizePayload(event.toolInput),
        output_summary: summarizePayload(event.toolResponse),
        metadata: {
          cwd: event.cwd,
          success: successfulToolEvent(event),
          tool_use_id: event.toolUseId,
          hook_event_name: event.hookEventName,
          sequence: event.sequence,
          source: 'claude-code-hooks',
        },
      }, true);
      tools += 1;

      if (cfg.trackGit && event.toolName === 'Bash') {
        const command = extractCommand(event.toolInput);
        if (command && isGitOperation(command)) {
          const operation = parseGitOperation(command);
          const output = outputText(event.toolResponse);
          await post(cfg, 'track-git', {
            session_id: claudeSessionId,
            operation_type: operation,
            repository_path: event.cwd || cwd,
            branch: 'unknown',
            commit_hash: extractCommitHash(output),
            commit_message: extractCommitMessage(command),
            metadata: { operation, command: command.slice(0, 500), workspace: eventWorkspace, source: 'claude-code-hooks' },
          }, true);
        }
      }
    }
  }

  // Counts are computed from the full authoritative transcript/event log, which
  // grows monotonically. The KFDB session_end handler OVERWRITES these counters
  // unconditionally (no set-if-greater), so a re-send whose recount is lower than
  // what we already sent would destroy the higher value. Guard: never send a
  // session_end that would lower either counter — skip the re-send entirely if a
  // recount comes back lower than the previously sent floor. Skipping the whole
  // POST (rather than omitting the fields) is the safe remedy regardless of how
  // the handler treats absent counter fields.
  const recountMessages = Math.max(summary?.messageCount ?? 0, countMessages(events));
  const recountTools = countToolCalls(events);
  const priorMessages = prior?.messageCount ?? 0;
  const priorTools = prior?.toolCallCount ?? 0;
  const wouldLower = recountMessages < priorMessages || recountTools < priorTools;

  if (wouldLower) {
    // Preserve the higher counts already on record; leave session_end untouched.
    return {
      messages,
      tools,
      maxSequence,
      sessionMessageCount: priorMessages,
      sessionToolCallCount: priorTools,
    };
  }

  await post(cfg, 'session-end', {
    session_id: claudeSessionId,
    ended_at: isoTime(last.receivedAt),
    message_count: recountMessages,
    tool_call_count: recountTools,
    outcome_summary: outcomeSummary(events, summary),
    success: true,
    metadata: {
      user_messages: events.filter((e) => e.prompt).length,
      assistant_messages: events.filter((e) => e.lastAssistantMessage).length,
      files_changed: summary?.filesChanged,
      ...metadata,
    },
  }, true);

  return {
    messages,
    tools,
    maxSequence,
    sessionMessageCount: recountMessages,
    sessionToolCallCount: recountTools,
  };
}
