/**
 * Pure, line-based transforms over `~/.codex/config.toml` content for wiring
 * Codex's plugin hooks to rd-plugin's `dist/codex-capture.mjs`. No TOML
 * library is used — Codex's own hook blocks are a small, fixed shape (verified
 * against a live wired `~/.codex/config.toml`), so a line-based scan/replace is
 * simpler and has zero new deps. Kept free of filesystem IO so it is fully
 * unit-testable; `setup-codex.ts` is the thin CLI that reads/writes the file.
 */

/** The 5 Codex hook events rd-plugin wires (verified shape, live config.toml). */
export const CODEX_HOOK_EVENTS = ['UserPromptSubmit', 'PreToolUse', 'PermissionRequest', 'PostToolUse', 'Stop'] as const;
export type CodexHookEvent = (typeof CODEX_HOOK_EVENTS)[number];

/** `matcher = "*"` line for events that carry one; `null` for events that don't (matches the live reference). */
const EVENT_MATCHERS: Record<CodexHookEvent, string | null> = {
  UserPromptSubmit: null,
  PreToolUse: '*',
  PermissionRequest: '*',
  PostToolUse: '*',
  Stop: null,
};

const RD_HOOK_MARKER = 'codex-capture.mjs';
const LEGACY_HOOK_MARKER = 'kfdb-codex-hook.mjs';

const HOOKS_BLOCK_HEADER_RE = /^\[\[hooks\.([A-Za-z0-9_]+)(?:\.hooks)?\]\]\s*$/;
const ANY_TABLE_HEADER_RE = /^\[+([^\]]+)\]+\s*$/;
const COMMAND_LINE_RE = /^(\s*command\s*=\s*)"([^"]*)"(\s*)$/;

export interface WiringStatus {
  /** Events whose `command = "..."` line already references codex-capture.mjs. */
  wiredEvents: CodexHookEvent[];
  /** Events whose `command = "..."` line references the legacy kfdb-codex-hook.mjs script. */
  legacyEvents: CodexHookEvent[];
  /** Events with neither a wired nor a legacy command line (no existing block, or an unrelated one). */
  missingEvents: CodexHookEvent[];
  /** True when every one of the 5 target events is already wired. */
  fullyWired: boolean;
  /** True when the file contains at least one `[[hooks.<Event>]]` block for ANY event. */
  hasAnyHooksSection: boolean;
}

/**
 * Scan `content` line by line, tracking which `[[hooks.<Event>]]` block is
 * currently active, and classify each of the 5 target events by whether its
 * `command = "..."` line (inside `[[hooks.<Event>.hooks]]`) references the
 * rd-plugin hook, the legacy hook, or neither.
 */
export function analyzeWiring(content: string): WiringStatus {
  const lines = content.split('\n');
  let currentEvent: string | null = null;
  let hasAnyHooksSection = false;
  const wired = new Set<CodexHookEvent>();
  const legacy = new Set<CodexHookEvent>();

  for (const line of lines) {
    const trimmed = line.trim();
    const hooksMatch = HOOKS_BLOCK_HEADER_RE.exec(trimmed);
    if (hooksMatch) {
      currentEvent = hooksMatch[1];
      hasAnyHooksSection = true;
      continue;
    }
    const tableMatch = ANY_TABLE_HEADER_RE.exec(trimmed);
    if (tableMatch) {
      // Any other table header (e.g. `[hooks.state]`, `[mcp_servers.x]`) ends
      // the current hooks-event context.
      currentEvent = null;
      continue;
    }
    if (!currentEvent) continue;
    const cmdMatch = COMMAND_LINE_RE.exec(line);
    if (!cmdMatch) continue;
    const command = cmdMatch[2];
    if (!isCodexHookEvent(currentEvent)) continue;
    if (command.includes(RD_HOOK_MARKER)) wired.add(currentEvent);
    else if (command.includes(LEGACY_HOOK_MARKER)) legacy.add(currentEvent);
  }

  const missingEvents = CODEX_HOOK_EVENTS.filter((e) => !wired.has(e) && !legacy.has(e));

  return {
    wiredEvents: CODEX_HOOK_EVENTS.filter((e) => wired.has(e)),
    legacyEvents: CODEX_HOOK_EVENTS.filter((e) => legacy.has(e)),
    missingEvents,
    fullyWired: wired.size === CODEX_HOOK_EVENTS.length,
    hasAnyHooksSection,
  };
}

function isCodexHookEvent(value: string): value is CodexHookEvent {
  return (CODEX_HOOK_EVENTS as readonly string[]).includes(value);
}

/**
 * Replace the command string inside every `command = "..."` line that
 * references the legacy hook script, regardless of which event block it is
 * in. Only the quoted value changes; indentation and the rest of the line are
 * preserved.
 */
export function repointLegacyCommands(content: string, newCommand: string): { content: string; changedCount: number } {
  let changedCount = 0;
  const lines = content.split('\n').map((line) => {
    const match = COMMAND_LINE_RE.exec(line);
    if (!match) return line;
    if (!match[2].includes(LEGACY_HOOK_MARKER)) return line;
    changedCount += 1;
    return `${match[1]}"${newCommand}"${match[3]}`;
  });
  return { content: lines.join('\n'), changedCount };
}

/** Build one `[[hooks.<Event>]]` + `[[hooks.<Event>.hooks]]` block for a single event. */
export function buildEventBlock(event: CodexHookEvent, command: string): string {
  const matcher = EVENT_MATCHERS[event];
  const lines = [`[[hooks.${event}]]`];
  if (matcher) lines.push(`matcher = "${matcher}"`);
  lines.push(`[[hooks.${event}.hooks]]`, `type = "command"`, `command = "${command}"`, `timeout = 10`);
  return lines.join('\n');
}

/** Build the complete 5-event block set, for a fresh install with no existing Codex hook wiring. */
export function buildFreshWiringBlock(command: string): string {
  return CODEX_HOOK_EVENTS.map((event) => buildEventBlock(event, command)).join('\n\n');
}

const APPEND_HEADER = '# rd-plugin: Codex session capture (added by setup-codex.mjs)';

/** Append `[[hooks.<Event>]]` blocks for exactly the given events to the end of the file. */
export function appendEventBlocks(content: string, events: readonly CodexHookEvent[], command: string): string {
  if (events.length === 0) return content;
  const block = events.map((event) => buildEventBlock(event, command)).join('\n\n');
  const needsLeadingNewline = content.length > 0 && !content.endsWith('\n');
  const prefix = needsLeadingNewline ? '\n\n' : content.endsWith('\n\n') ? '' : '\n';
  return `${content}${prefix}${APPEND_HEADER}\n${block}\n`;
}

export interface WiringPlanResult {
  content: string;
  /** Number of legacy `command = "..."` lines rewritten to `newCommand`. */
  repointedCount: number;
  /** Events for which a brand-new block was appended (no prior block at all). */
  appendedEvents: CodexHookEvent[];
}

/**
 * Apply the full wiring plan to `content`: repoint every legacy command line
 * in place, then append fresh blocks for any of the 5 events that had neither
 * a wired nor a legacy command line. Pure — returns the new content; the
 * caller is responsible for backing up and writing the file.
 */
export function applyWiring(content: string, newCommand: string): WiringPlanResult {
  const status = analyzeWiring(content);
  const repointed = repointLegacyCommands(content, newCommand);
  const withAppended = appendEventBlocks(repointed.content, status.missingEvents, newCommand);
  return {
    content: withAppended,
    repointedCount: repointed.changedCount,
    appendedEvents: status.missingEvents,
  };
}
