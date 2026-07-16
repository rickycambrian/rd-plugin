import { afterEach, describe, expect, it, vi } from 'vitest';
import { gatherContextPack } from '../src/lib/context-pack.js';

const ORIGINAL_FETCH = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = ORIGINAL_FETCH;
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

describe('gatherContextPack', () => {
  it('prefers the wallet-authenticated Home compiled pack and renders every decision-relevant section', async () => {
    const calls: Array<{ url: string; auth: string | null }> = [];
    globalThis.fetch = vi.fn(async (url, init) => {
      calls.push({ url: String(url), auth: new Headers(init?.headers).get('authorization') });
      return json({
        version: 'context-pack/v1',
        reproducibility_hash: 'a'.repeat(64),
        token_estimate: 420,
        anchor: { kind: 'repo', repoId: 'rickydata_home' },
        brief: 'Complete repository decision context.',
        invariants: [{ text: 'Human approval remains authoritative.', source_ref: 'skill:audit' }],
        verification: [{ kind: 'gate', status: 'satisfied', evidence_ref: 'commit:abc1234' }],
        work_in_progress: [{ slug: 'levanto', name: 'Levanto decision intelligence', issue_ref: 'github:1', issue_state: 'open', linked_prs: [], session_artifacts: 2 }],
        wiki: [{ slug: 'context-packs', title: 'Context packs', summary: 'Compiler contract.', status: 'active', rank_reason: 'anchor' }],
        lessons: [{ text: 'Persist exact inputs.', confidence: 0.9, source_ref: 'answer-sheet:one' }],
        decisions: [{ title: 'Keep human authority', action: 'approve', decided_at: '2026-07-14T10:00:00Z', source_ref_id: 'decision:one' }],
        traps: [{ name: 'auth', hook: 'Never expose wallet keys.' }],
        open_questions: [{ question: 'Is the scheduler healthy?', id: 'oq:one' }],
        omitted: [{ section: 'wiki', count: 2, reason: 'budget' }],
        omitted_items: [{ section: 'wiki', id: 'wiki:old', reason: 'budget' }],
        selected_items: [{ section: 'wiki', id: 'context-packs', content_hash: 'b'.repeat(64), token_estimate: 40 }],
        coverage: { status: 'bounded', sources: [{ source: 'wiki_pages', status: 'ok', count: 10 }] },
      });
    }) as typeof fetch;

    const pack = await gatherContextPack({
      apiUrl: 'https://kfdb.example', auth: {}, query: 'rickydata_home typescript session start',
      homeUrl: 'https://home.example', homeToken: 'scwt_test', repoId: 'rickydata_home',
      homeBudget: 4000,
    });

    expect(calls).toHaveLength(1);
    expect(calls[0]).toEqual(expect.objectContaining({
      url: expect.stringContaining('/api/context-pack?repo=rickydata_home'),
      auth: 'Bearer scwt_test',
    }));
    expect(calls[0].url).toContain('budget=4000');
    expect(pack.source).toBe('home');
    expect(pack.coverageStatus).toBe('bounded');
    expect(pack.reproducibilityHash).toBe('a'.repeat(64));
    for (const text of ['Human approval', 'satisfied', 'Levanto decision intelligence', 'Context packs', 'Persist exact inputs', 'Keep human authority', 'Never expose wallet keys', 'Is the scheduler healthy?']) {
      expect(pack.text).toContain(text);
    }
    expect(pack.text).toContain('2 wiki item(s): budget');
    expect(pack.text).toContain('wiki:old');
  });

  it('requests a task-anchored immutable pack when a prospective task slug is available', async () => {
    let requested = '';
    globalThis.fetch = vi.fn(async (url) => {
      requested = String(url);
      return json({
        version: 'context-pack/v1', reproducibility_hash: 'd'.repeat(64), context_pack_id: 'pack-task-1',
        anchor: { kind: 'task', taskSlug: 'work-contract-1' }, invariants: [], verification: [],
        work_in_progress: [], wiki: [], lessons: [], decisions: [], traps: [], open_questions: [],
        selected_items: [], omitted: [], omitted_items: [], coverage: { status: 'complete', sources: [] },
      });
    }) as typeof fetch;
    const pack = await gatherContextPack({
      apiUrl: 'https://kfdb.example', auth: {}, query: 'implement the exact oracle',
      homeUrl: 'https://home.example', homeToken: 'scwt_test', repoId: 'rd-plugin',
      taskSlug: 'work-contract-1', homeBudget: 20000,
    });
    expect(requested).toContain('repo=rd-plugin');
    expect(requested).toContain('task=work-contract-1');
    expect(requested).toContain('budget=20000');
    expect(pack.packId).toBe('pack-task-1');
  });

  it('labels the answer-sheet fallback incomplete when Home is unavailable', async () => {
    globalThis.fetch = vi.fn(async (url) => {
      const value = String(url);
      if (value.includes('home.example')) return json({ error: 'unavailable' }, 503);
      if (value.includes('/answer-sheets/match')) {
        return json({ matches: [{ sheet_id: 'sheet-1', title: 'Prior decision', solution_summary: 'Use the durable queue.' }] });
      }
      return json({ items: [] });
    }) as typeof fetch;

    const pack = await gatherContextPack({
      apiUrl: 'https://kfdb.example', auth: {}, query: 'repo session start',
      homeUrl: 'https://home.example', homeToken: 'scwt_test', repoId: 'repo',
    });

    expect(pack.source).toBe('answer-sheets-fallback');
    expect(pack.coverageStatus).toBe('incomplete');
    expect(pack.text).toContain('CONTEXT COVERAGE — INCOMPLETE');
    expect(pack.text).toContain('Home compiled context pack unavailable');
    expect(pack.text).toContain('Prior decision: Use the durable queue.');
  });

  it('waits long enough for a cold complete Home compile instead of timing out at 4.2s', async () => {
    vi.useFakeTimers();
    globalThis.fetch = vi.fn(async (url, init) => {
      if (!String(url).includes('home.example')) return json({ items: [], matches: [] });
      return await new Promise<Response>((resolve, reject) => {
        const timer = setTimeout(() => resolve(json({
          version: 'context-pack/v1', reproducibility_hash: 'c'.repeat(64),
          anchor: { kind: 'repo', repoId: 'rd-plugin' }, brief: 'Cold complete pack.',
          invariants: [], verification: [], work_in_progress: [], wiki: [], lessons: [],
          decisions: [], traps: [], open_questions: [], selected_items: [], omitted: [], omitted_items: [],
          coverage: { status: 'complete', sources: [] },
        })), 5_000);
        init?.signal?.addEventListener('abort', () => {
          clearTimeout(timer);
          reject(new DOMException('aborted', 'AbortError'));
        });
      });
    }) as typeof fetch;

    const pending = gatherContextPack({
      apiUrl: 'https://kfdb.example', auth: {}, query: 'rd-plugin session start',
      homeUrl: 'https://home.example', homeToken: 'scwt_test', repoId: 'rd-plugin', timeoutMs: 8_500,
    });
    await vi.advanceTimersByTimeAsync(5_000);
    const pack = await pending;
    expect(pack.source).toBe('home');
    expect(pack.coverageStatus).toBe('complete');
  });
});
