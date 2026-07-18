import { describe, it, expect } from 'vitest';
import { resolveClaudeSessionId } from '../src/lib/hook-input.js';

describe('resolveClaudeSessionId', () => {
  it('prefers the harness-provided session_id', () => {
    expect(resolveClaudeSessionId({ session_id: '2a72dc53-5929-487b-9fec-831ba241a4b7' }))
      .toBe('2a72dc53-5929-487b-9fec-831ba241a4b7');
  });

  it('falls back to the transcript basename UUID when session_id is missing', () => {
    expect(resolveClaudeSessionId({ transcript_path: '/home/u/.claude/projects/p/358a2092-d3e6-4fd2-a0d3-1c039f1d89f8.jsonl' }))
      .toBe('358a2092-d3e6-4fd2-a0d3-1c039f1d89f8');
  });

  it('keeps two different transcript paths distinct (no collapse)', () => {
    const a = resolveClaudeSessionId({ transcript_path: '/p/aaaaaaaa-0000-0000-0000-000000000001.jsonl' });
    const b = resolveClaudeSessionId({ transcript_path: '/p/bbbbbbbb-0000-0000-0000-000000000002.jsonl' });
    expect(a).not.toBe(b);
    expect(a).not.toBe('unknown');
    expect(b).not.toBe('unknown');
  });

  it('returns unknown only when neither session_id nor transcript_path is present', () => {
    expect(resolveClaudeSessionId({})).toBe('unknown');
    expect(resolveClaudeSessionId({ session_id: '' })).toBe('unknown');
  });
});
