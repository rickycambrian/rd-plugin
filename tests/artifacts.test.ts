import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildContentArtifactOperations } from 'rickydata/kfdb';
import { writeContentArtifacts } from '../src/lib/artifacts.js';

const ORIGINAL_FETCH = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = ORIGINAL_FETCH;
  vi.restoreAllMocks();
});

const config = {
  api_url: 'https://kfdb.example', home_url: 'https://home.example', enabled: true,
  excluded_directories: [], track_messages: true, track_files: true, track_git: true, log_level: 'silent',
};

describe('immutable content artifact writer', () => {
  it('PUTs exact observable content with if_absent before graph references', async () => {
    const built = buildContentArtifactOperations({
      content: 'exact prompt bytes', mediaType: 'text/plain; charset=utf-8', observableKind: 'human-prompt',
    });
    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({ acquired: true }), { status: 200 })) as typeof fetch;

    const result = await writeContentArtifacts(config, { apiKey: 'api-key', deriveHeaders: { 'X-Wallet-Address': '0xabc', 'X-Derive-Session-Id': 's', 'X-Derive-Key': 'k' } }, [built.artifact, built.artifact]);

    expect(result).toEqual({ attempted: 1, persisted: 1, queued: 0, ok: true });
    const call = vi.mocked(globalThis.fetch).mock.calls[0];
    expect(call[0]).toBe('https://kfdb.example/api/v1/kv');
    expect(call[1]?.method).toBe('PUT');
    expect(JSON.parse(String(call[1]?.body))).toEqual({ key: built.artifact.key, value: built.artifact.value, if_absent: true });
  });

  it('writes with bounded concurrency instead of serially or stampeding', async () => {
    const artifacts = Array.from({ length: 12 }, (_, index) => buildContentArtifactOperations({
      content: `artifact ${index}`, mediaType: 'text/plain; charset=utf-8', observableKind: 'tool-response',
    }).artifact);
    let active = 0;
    let maxActive = 0;
    globalThis.fetch = vi.fn(async () => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise((resolve) => setTimeout(resolve, 20));
      active -= 1;
      return new Response(JSON.stringify({ acquired: true }), { status: 200 });
    }) as typeof fetch;

    const result = await writeContentArtifacts(config, {
      apiKey: 'api-key',
      deriveHeaders: { 'X-Wallet-Address': '0xabc', 'X-Derive-Session-Id': 's', 'X-Derive-Key': 'k' },
    }, artifacts);

    expect(result).toEqual({ attempted: 12, persisted: 12, queued: 0, ok: true });
    expect(maxActive).toBe(4);
  });
});
