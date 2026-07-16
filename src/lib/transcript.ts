import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { PendingEvent } from './event.js';

const FILE_EDIT_TOOLS = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit']);

interface TranscriptEntry {
  type?: string;
  isMeta?: boolean;
  uuid?: string;
  parentUuid?: string;
  parentSessionId?: string;
  sessionId?: string;
  cwd?: string;
  timestamp?: string;
  message?: {
    role?: string;
    model?: string;
    content?: unknown;
  };
}

export interface TranscriptSummary {
  claudeSessionId?: string;
  cwd?: string;
  model?: string;
  initialPrompt?: string;
  messageCount: number;
  filesChanged: number;
  parentSessionId?: string;
}

function readLines(transcriptPath: string): TranscriptEntry[] {
  let raw: string;
  try {
    raw = fs.readFileSync(transcriptPath, 'utf8');
  } catch {
    return [];
  }
  const entries: TranscriptEntry[] = [];
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      entries.push(JSON.parse(trimmed) as TranscriptEntry);
    } catch {
      // skip malformed lines
    }
  }
  return entries;
}

/** Extract plain text from a message.content that may be a string or block array. */
function contentText(content: unknown): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .filter((b): b is { type?: string; text?: string } => !!b && typeof b === 'object')
      .filter((b) => b.type === 'text' && typeof b.text === 'string')
      .map((b) => b.text as string)
      .join('\n');
  }
  return '';
}

/** A real user prompt is a non-meta user text entry that is not a slash-command or tool_result. */
function isRealUserPrompt(entry: TranscriptEntry): string | null {
  if (entry.type !== 'user' || entry.isMeta) return null;
  const content = entry.message?.content;
  if (Array.isArray(content) && content.some((b) => b && typeof b === 'object' && (b as { type?: string }).type === 'tool_result')) {
    return null;
  }
  const text = contentText(content).trim();
  if (!text) return null;
  if (/^<(local-command|command-name|command-message|command-args|command-stdout)/.test(text)) return null;
  return text;
}

/**
 * Parse a transcript for the session-level enrichment fields that are null in
 * the graph today: initial_prompt, files_changed, parent_session_id, plus model
 * and message_count. Never throws.
 */
export function parseTranscriptSummary(transcriptPath: string): TranscriptSummary {
  const entries = readLines(transcriptPath);
  const summary: TranscriptSummary = { messageCount: 0, filesChanged: 0 };
  const changedFiles = new Set<string>();
  const seenUuids = new Set<string>();

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    if (!summary.claudeSessionId && typeof entry.sessionId === 'string') summary.claudeSessionId = entry.sessionId;
    if (!summary.cwd && typeof entry.cwd === 'string') summary.cwd = entry.cwd;

    // parent_session_id (from the first records only, before within-file chaining).
    if (summary.parentSessionId === undefined && i < 40) {
      if (typeof entry.parentSessionId === 'string') summary.parentSessionId = entry.parentSessionId;
      else if (typeof entry.parentUuid === 'string' && !seenUuids.has(entry.parentUuid)) summary.parentSessionId = entry.parentUuid;
    }
    if (typeof entry.uuid === 'string') seenUuids.add(entry.uuid);

    if (entry.type === 'user' || entry.type === 'assistant') summary.messageCount += 1;

    if (!summary.initialPrompt) {
      const prompt = isRealUserPrompt(entry);
      if (prompt) summary.initialPrompt = prompt;
    }

    if (entry.type === 'assistant') {
      if (typeof entry.message?.model === 'string' && entry.message.model) summary.model = entry.message.model;
      const content = entry.message?.content;
      if (Array.isArray(content)) {
        for (const block of content) {
          if (!block || typeof block !== 'object') continue;
          const b = block as { type?: string; name?: string; input?: Record<string, unknown> };
          if (b.type === 'tool_use' && b.name && FILE_EDIT_TOOLS.has(b.name)) {
            const fp = (b.input?.file_path ?? b.input?.path) as string | undefined;
            if (typeof fp === 'string' && fp) changedFiles.add(fp);
          }
        }
      }
    }
  }

  summary.filesChanged = changedFiles.size;
  return summary;
}

/**
 * Synthesize a normalized event stream from a transcript so historical sessions
 * (backfill) can replay through the same flush pipeline. Emits UserPromptSubmit
 * for real user prompts, PostToolUse per tool_use block (with its matching
 * tool_result), and a trailing Stop. Deterministic ordering + ids from the
 * transcript make re-runs idempotent.
 */
export function transcriptToEvents(transcriptPath: string): PendingEvent[] {
  const entries = readLines(transcriptPath);
  if (entries.length === 0) return [];

  // Map tool_use_id -> observable result content plus its explicit failure bit.
  const toolResults = new Map<string, { content: unknown; isError: boolean }>();
  for (const entry of entries) {
    const content = entry.message?.content;
    if (Array.isArray(content)) {
      for (const block of content) {
        if (block && typeof block === 'object' && (block as { type?: string }).type === 'tool_result') {
          const b = block as { tool_use_id?: string; content?: unknown; is_error?: boolean };
          if (typeof b.tool_use_id === 'string') {
            toolResults.set(b.tool_use_id, { content: b.content, isError: b.is_error === true });
          }
        }
      }
    }
  }

  const claudeSessionId = entries.find((e) => typeof e.sessionId === 'string')?.sessionId ?? 'unknown';
  const events: PendingEvent[] = [];
  let sequence = 0;
  let lastModel: string | undefined;
  let lastCwd: string | undefined;
  let lastAssistantMessage: string | undefined;
  let lastTs = Date.now();

  const push = (partial: Omit<PendingEvent, 'sequence' | 'claudeSessionId' | 'receivedAt'>): void => {
    events.push({ sequence: sequence++, claudeSessionId, receivedAt: lastTs, ...partial });
  };

  for (const entry of entries) {
    if (typeof entry.cwd === 'string') lastCwd = entry.cwd;
    if (typeof entry.timestamp === 'string') {
      const t = Date.parse(entry.timestamp);
      if (!Number.isNaN(t)) lastTs = t;
    }
    if (entry.type === 'assistant' && typeof entry.message?.model === 'string') lastModel = entry.message.model;

    const prompt = isRealUserPrompt(entry);
    if (prompt) {
      push({ hookEventName: 'UserPromptSubmit', cwd: lastCwd, model: lastModel, prompt });
      continue;
    }

    if (entry.type === 'assistant') {
      const assistantText = contentText(entry.message?.content);
      if (assistantText.trim()) lastAssistantMessage = assistantText;
    }

    if (entry.type === 'assistant' && Array.isArray(entry.message?.content)) {
      for (const block of entry.message.content as unknown[]) {
        if (!block || typeof block !== 'object') continue;
        const b = block as { type?: string; name?: string; id?: string; input?: unknown };
        if (b.type === 'tool_use' && b.name) {
          const result = b.id ? toolResults.get(b.id) : undefined;
          push({
            hookEventName: result?.isError ? 'PostToolUseFailure' : 'PostToolUse',
            cwd: lastCwd,
            model: lastModel,
            toolName: b.name,
            toolUseId: b.id,
            toolInput: b.input,
            toolResponse: result?.content,
          });
        }
      }
    }
  }

  push({
    hookEventName: 'Stop', cwd: lastCwd, model: lastModel, reason: 'backfill',
    lastAssistantMessage,
  });
  return events;
}

/** Fallback transcript path resolution when the hook did not carry one. */
export function findTranscriptForSession(claudeSessionId: string): string | undefined {
  const projectsDir = path.join(os.homedir(), '.claude', 'projects');
  try {
    const stack = [projectsDir];
    while (stack.length > 0) {
      const dir = stack.pop() as string;
      let dirents: fs.Dirent[];
      try {
        dirents = fs.readdirSync(dir, { withFileTypes: true });
      } catch {
        continue;
      }
      for (const dirent of dirents) {
        const full = path.join(dir, dirent.name);
        if (dirent.isDirectory()) stack.push(full);
        else if (dirent.isFile() && dirent.name === `${claudeSessionId}.jsonl`) return full;
      }
    }
  } catch {
    // ignore
  }
  return undefined;
}
