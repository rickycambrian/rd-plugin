import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseTranscriptSummary, transcriptToEvents } from '../src/lib/transcript.js';

const FIXTURE = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'transcript-sample.jsonl');
const FAILURE_FIXTURE = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'transcript-failure.jsonl');

describe('parseTranscriptSummary', () => {
  const summary = parseTranscriptSummary(FIXTURE);

  it('extracts the initial user prompt (not tool_result entries)', () => {
    expect(summary.initialPrompt).toBe('Fix the SQL query in report.py');
  });

  it('extracts parent_session_id from the first parentUuid', () => {
    expect(summary.parentSessionId).toBe('prior-xyz');
  });

  it('counts files changed from Edit/Write only (Read excluded)', () => {
    expect(summary.filesChanged).toBe(1);
  });

  it('counts every user + assistant message', () => {
    expect(summary.messageCount).toBe(6);
  });

  it('captures model and session id', () => {
    expect(summary.model).toBe('claude-haiku-4-5');
    expect(summary.claudeSessionId).toBe('sess-abc');
  });
});

describe('transcriptToEvents', () => {
  const events = transcriptToEvents(FIXTURE);

  it('synthesizes prompt + tool events + a trailing Stop', () => {
    const kinds = events.map((e) => e.hookEventName);
    expect(kinds).toEqual(['UserPromptSubmit', 'PostToolUse', 'PostToolUse', 'Stop']);
  });

  it('matches tool_results to their tool_use by id', () => {
    const edit = events.find((e) => e.toolName === 'Edit');
    expect(edit?.toolUseId).toBe('tool2');
    expect(edit?.toolResponse).toBe('Applied edit.');
  });

  it('assigns monotonic sequences and a stable session id', () => {
    expect(events.map((e) => e.sequence)).toEqual([0, 1, 2, 3]);
    expect(new Set(events.map((e) => e.claudeSessionId))).toEqual(new Set(['sess-abc']));
  });

  it('preserves the final observable assistant message on the synthetic Stop', () => {
    expect(events.at(-1)?.lastAssistantMessage).toBe('Done — corrected the typo in the SQL query.');
  });

  it('preserves transcript tool failures as PostToolUseFailure events', () => {
    const failureEvents = transcriptToEvents(FAILURE_FIXTURE);
    expect(failureEvents.map((event) => event.hookEventName)).toEqual([
      'UserPromptSubmit',
      'PostToolUseFailure',
      'Stop',
    ]);
    expect(failureEvents[1]).toMatchObject({
      toolName: 'Bash',
      toolUseId: 'tool-fail',
      toolResponse: 'command exited with status 1',
    });
  });
});
