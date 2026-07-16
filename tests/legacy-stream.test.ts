import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { writeLegacyStream, type LegacyStreamConfig } from '../src/lib/legacy-stream.js';
import type { PendingEvent } from '../src/lib/event.js';

const CFG: LegacyStreamConfig = {
  apiUrl: 'http://kfdb.test',
  auth: {
    apiKey: 'test-key',
    deriveHeaders: {
      'X-Wallet-Address': '0xb3e6fa9620933ba9a6037f4ff890ec5fad0ba113',
      'X-Derive-Session-Id': 'sess',
      'X-Derive-Key': 'key',
    },
  },
  trackMessages: true,
  trackFiles: true,
  trackGit: true,
};

function toolEvent(seq: number): PendingEvent {
  return {
    sequence: seq,
    hookEventName: 'PostToolUse',
    claudeSessionId: 'sess-abc',
    receivedAt: 1_700_000_000_000 + seq,
    toolName: 'Read',
    toolUseId: `tool-${seq}`,
    toolInput: { file_path: `/tmp/f${seq}.py` },
    toolResponse: { success: true },
  } as PendingEvent;
}

function promptEvent(seq: number): PendingEvent {
  return {
    sequence: seq,
    hookEventName: 'UserPromptSubmit',
    claudeSessionId: 'sess-abc',
    receivedAt: 1_700_000_000_000 + seq,
    prompt: `prompt ${seq}`,
  } as PendingEvent;
}

/** Capture every session-end POST body sent through the mocked fetch. */
function installFetchCapture(): { sessionEnds: Array<Record<string, unknown>> } {
  const sessionEnds: Array<Record<string, unknown>> = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: { body?: string }) => {
      if (String(url).endsWith('/api/v1/plugin/session-end') && init?.body) {
        sessionEnds.push(JSON.parse(init.body));
      }
      return {
        ok: true,
        status: 200,
        text: async () => '{}',
        json: async () => ({}),
      } as unknown as Response;
    }),
  );
  return { sessionEnds };
}

describe('writeLegacyStream session_end counter monotonicity guard', () => {
  beforeEach(() => vi.unstubAllGlobals());
  afterEach(() => vi.unstubAllGlobals());

  it('sends the full recount on first flush and reports it as the new floor', async () => {
    const { sessionEnds } = installFetchCapture();
    const events = [promptEvent(0), toolEvent(1), toolEvent(2), toolEvent(3)];

    const result = await writeLegacyStream(CFG, 'sess-abc', events, -1);

    expect(sessionEnds).toHaveLength(1);
    expect(sessionEnds[0].message_count).toBe(1);
    expect(sessionEnds[0].tool_call_count).toBe(3);
    expect(result.sessionMessageCount).toBe(1);
    expect(result.sessionToolCallCount).toBe(3);
  });

  it('SKIPS the session_end re-send when a recount is lower than the prior floor', async () => {
    const { sessionEnds } = installFetchCapture();
    // Only two tool calls survive this recount, but a prior send recorded three.
    const events = [promptEvent(0), toolEvent(1), toolEvent(2)];

    const result = await writeLegacyStream(CFG, 'sess-abc', events, -1, undefined, undefined, {
      messageCount: 1,
      toolCallCount: 3,
    });

    // No session-end POST at all — the higher counts already on record stand.
    expect(sessionEnds).toHaveLength(0);
    // The persisted floor is preserved at the prior (higher) values, never lowered.
    expect(result.sessionMessageCount).toBe(1);
    expect(result.sessionToolCallCount).toBe(3);
  });

  it('sends when the recount is higher than the prior floor and raises the floor', async () => {
    const { sessionEnds } = installFetchCapture();
    const events = [promptEvent(0), toolEvent(1), toolEvent(2), toolEvent(3), toolEvent(4)];

    const result = await writeLegacyStream(CFG, 'sess-abc', events, -1, undefined, undefined, {
      messageCount: 1,
      toolCallCount: 3,
    });

    expect(sessionEnds).toHaveLength(1);
    expect(sessionEnds[0].tool_call_count).toBe(4);
    expect(result.sessionToolCallCount).toBe(4);
  });

  it('sends when the recount equals the prior floor (equal is not lower)', async () => {
    const { sessionEnds } = installFetchCapture();
    const events = [promptEvent(0), toolEvent(1), toolEvent(2), toolEvent(3)];

    const result = await writeLegacyStream(CFG, 'sess-abc', events, -1, undefined, undefined, {
      messageCount: 1,
      toolCallCount: 3,
    });

    expect(sessionEnds).toHaveLength(1);
    expect(sessionEnds[0].tool_call_count).toBe(3);
    expect(result.sessionToolCallCount).toBe(3);
  });
});
