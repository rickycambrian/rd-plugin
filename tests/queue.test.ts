import { describe, it, expect, beforeEach, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const postJsonMock = vi.hoisted(() => vi.fn());
vi.mock('../src/lib/http.js', () => ({
  postJson: postJsonMock,
  postForm: vi.fn(),
}));

import { enqueue, drainQueue, queueSize, type QueuedRequest } from '../src/lib/queue.js';

const AUTH = {
  apiKey: 'test-key',
  deriveHeaders: {
    'X-Wallet-Address': '0xabc',
    'X-Derive-Session-Id': 'sid',
    'X-Derive-Key': 'key',
  },
};

let dir: string;
let deadDir: string;

function dirs() {
  return { dir, deadDir };
}

function queuedFiles(): string[] {
  return fs.readdirSync(dir).filter((f) => f.endsWith('.json')).sort();
}

function readEntry(file: string): QueuedRequest {
  return JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8')) as QueuedRequest;
}

function ok() {
  return { ok: true, status: 200, text: '{}', json: {} };
}

function serverError() {
  return { ok: false, status: 500, text: 'boom', json: null };
}

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rd-queue-'));
  deadDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rd-dead-'));
  postJsonMock.mockReset();
});

describe('enqueue', () => {
  it('writes a queue file and skips content-identical duplicates', () => {
    const request = { url: 'http://x/api/v1/write', body: { operations: [1] }, requiresBearer: true, requiresDerive: true };
    enqueue(request, dirs());
    enqueue(request, dirs());
    expect(queuedFiles()).toHaveLength(1);
    expect(queueSize(dirs())).toBe(1);
  });

  it('replaces older entries with the same dedupeKey (newer content wins)', () => {
    const base = { url: 'http://x/api/v1/write', requiresBearer: true, requiresDerive: true, dedupeKey: 'graph:s1:0' };
    enqueue({ ...base, body: { operations: [1] } }, dirs());
    enqueue({ ...base, body: { operations: [1, 2] } }, dirs());
    const files = queuedFiles();
    expect(files).toHaveLength(1);
    expect((readEntry(files[0]).body as { operations: number[] }).operations).toEqual([1, 2]);
  });

  it('does not cross-replace distinct dedupeKeys', () => {
    const base = { url: 'http://x/api/v1/write', requiresBearer: true, requiresDerive: true };
    enqueue({ ...base, body: { operations: [1] }, dedupeKey: 'graph:s1:0' }, dirs());
    enqueue({ ...base, body: { operations: [2] }, dedupeKey: 'graph:s1:1' }, dirs());
    expect(queuedFiles()).toHaveLength(2);
  });
});

describe('drainQueue', () => {
  it('sends entries and removes them on 2xx', async () => {
    enqueue({ url: 'http://x/w', body: { operations: [1] }, requiresBearer: true, requiresDerive: true }, dirs());
    postJsonMock.mockResolvedValue(ok());
    const result = await drainQueue(AUTH, 500, dirs());
    expect(result.sent).toBe(1);
    expect(result.remaining).toBe(0);
    expect(queuedFiles()).toHaveLength(0);
  });

  it('applies backoff on failure and defers until nextAttemptAt', async () => {
    enqueue({ url: 'http://x/w', body: { operations: [1] }, requiresBearer: true, requiresDerive: true }, dirs());
    postJsonMock.mockResolvedValue(serverError());
    const first = await drainQueue(AUTH, 500, dirs());
    expect(first.failed).toBe(1);
    const entry = readEntry(queuedFiles()[0]);
    expect(entry.attempts).toBe(1);
    expect(Date.parse(entry.nextAttemptAt!)).toBeGreaterThan(Date.now());
    expect(entry.lastError).toContain('HTTP 500');

    postJsonMock.mockClear();
    const second = await drainQueue(AUTH, 500, dirs());
    expect(second.deferred).toBe(1);
    expect(postJsonMock).not.toHaveBeenCalled();
  });

  it('dead-letters transient failures after 12 attempts', async () => {
    enqueue({ url: 'http://x/w', body: { operations: [1] }, requiresBearer: true, requiresDerive: true }, dirs());
    const file = queuedFiles()[0];
    const entry = readEntry(file);
    fs.writeFileSync(path.join(dir, file), JSON.stringify({ ...entry, attempts: 11 }));
    postJsonMock.mockResolvedValue(serverError());
    const result = await drainQueue(AUTH, 500, dirs());
    expect(result.deadLettered).toBe(1);
    expect(queuedFiles()).toHaveLength(0);
    expect(fs.readdirSync(deadDir)).toHaveLength(1);
  });

  it('dead-letters permanent (4xx) failures after 3 attempts', async () => {
    enqueue({ url: 'http://x/w', body: { operations: [1] }, requiresBearer: true, requiresDerive: true }, dirs());
    const file = queuedFiles()[0];
    fs.writeFileSync(path.join(dir, file), JSON.stringify({ ...readEntry(file), attempts: 2 }));
    postJsonMock.mockResolvedValue({ ok: false, status: 400, text: 'bad request', json: null });
    const result = await drainQueue(AUTH, 500, dirs());
    expect(result.deadLettered).toBe(1);
    expect(fs.readdirSync(deadDir)).toHaveLength(1);
  });

  it('treats 404 as transient (dependency ordering), not permanent', async () => {
    // A track-message 404s until the post that creates its parent session
    // record lands; at 3 attempts it must stay queued, not dead-letter.
    enqueue({ url: 'http://x/w', body: { operations: [1] }, requiresBearer: true, requiresDerive: true }, dirs());
    const file = queuedFiles()[0];
    fs.writeFileSync(path.join(dir, file), JSON.stringify({ ...readEntry(file), attempts: 2 }));
    postJsonMock.mockResolvedValue({ ok: false, status: 404, text: 'session not found', json: null });
    const result = await drainQueue(AUTH, 500, dirs());
    expect(result.deadLettered).toBe(0);
    expect(result.failed).toBe(1);
    expect(queuedFiles()).toHaveLength(1);
    expect(fs.readdirSync(deadDir)).toHaveLength(0);
  });

  it.each([401, 403, 405])('treats flappy KFDB %i as transient, not permanent', async (status) => {
    // 405 observed live 2026-07-15 on a kv artifact PUT that succeeded verbatim
    // on manual replay; 401/403 flap while a sign-to-derive session is expired.
    enqueue({ url: 'http://x/w', body: { operations: [1] }, requiresBearer: true, requiresDerive: true }, dirs());
    const file = queuedFiles()[0];
    fs.writeFileSync(path.join(dir, file), JSON.stringify({ ...readEntry(file), attempts: 2 }));
    postJsonMock.mockResolvedValue({ ok: false, status, text: 'flap', json: null });
    const result = await drainQueue(AUTH, 500, dirs());
    expect(result.deadLettered).toBe(0);
    expect(queuedFiles()).toHaveLength(1);
    expect(fs.readdirSync(deadDir)).toHaveLength(0);
  });

  it('splits a timed-out operations batch into ordered halves', async () => {
    const operations = Array.from({ length: 120 }, (_, i) => ({ op: i }));
    enqueue({ url: 'http://x/w', body: { operations, skip_embedding: true }, requiresBearer: true, requiresDerive: true }, dirs());
    const abort = new Error('This operation was aborted');
    abort.name = 'AbortError';
    postJsonMock.mockRejectedValue(abort);
    const result = await drainQueue(AUTH, 500, dirs());
    expect(result.split).toBe(1);
    const files = queuedFiles();
    expect(files).toHaveLength(2);
    const first = readEntry(files[0]).body as { operations: { op: number }[]; skip_embedding: boolean };
    const second = readEntry(files[1]).body as { operations: { op: number }[] };
    expect(first.operations).toHaveLength(60);
    expect(second.operations).toHaveLength(60);
    expect(first.operations[0].op).toBe(0);
    expect(second.operations[0].op).toBe(60);
    expect(first.skip_embedding).toBe(true);
  });

  it('does not split small batches on timeout (backoff instead)', async () => {
    enqueue({ url: 'http://x/w', body: { operations: [{ op: 1 }] }, requiresBearer: true, requiresDerive: true }, dirs());
    const abort = new Error('aborted');
    abort.name = 'AbortError';
    postJsonMock.mockRejectedValue(abort);
    const result = await drainQueue(AUTH, 500, dirs());
    expect(result.split).toBe(0);
    expect(result.failed).toBe(1);
    expect(readEntry(queuedFiles()[0]).attempts).toBe(1);
  });

  it('attempts identical content once per drain and removes duplicates on success', async () => {
    const entry: QueuedRequest = {
      url: 'http://x/w',
      body: { operations: [1] },
      requiresBearer: true,
      requiresDerive: true,
      queuedAt: new Date().toISOString(),
    };
    // Legacy-format filenames (no content-hash suffix) with identical content.
    fs.writeFileSync(path.join(dir, '100-aaa.json'), JSON.stringify(entry));
    fs.writeFileSync(path.join(dir, '200-bbb.json'), JSON.stringify(entry));
    postJsonMock.mockResolvedValue(ok());
    const result = await drainQueue(AUTH, 500, dirs());
    expect(result.sent).toBe(1);
    expect(result.deduped).toBe(1);
    expect(postJsonMock).toHaveBeenCalledTimes(1);
    expect(queuedFiles()).toHaveLength(0);
  });

  it('does not re-attempt a content hash that already failed this drain', async () => {
    const entry: QueuedRequest = {
      url: 'http://x/w',
      body: { operations: [1] },
      requiresBearer: true,
      requiresDerive: true,
      queuedAt: new Date().toISOString(),
    };
    fs.writeFileSync(path.join(dir, '100-aaa.json'), JSON.stringify(entry));
    fs.writeFileSync(path.join(dir, '200-bbb.json'), JSON.stringify(entry));
    postJsonMock.mockResolvedValue(serverError());
    const result = await drainQueue(AUTH, 500, dirs());
    expect(postJsonMock).toHaveBeenCalledTimes(1);
    expect(result.failed).toBe(1);
    expect(result.deferred).toBe(1);
  });

  it('leaves entries needing auth when auth is unavailable', async () => {
    enqueue({ url: 'http://x/w', body: { operations: [1] }, requiresBearer: true, requiresDerive: true }, dirs());
    const result = await drainQueue({}, 500, dirs());
    expect(result.failed).toBe(1);
    expect(queuedFiles()).toHaveLength(1);
    expect(postJsonMock).not.toHaveBeenCalled();
  });

  it('skips the drain when a fresh lock is held', async () => {
    enqueue({ url: 'http://x/w', body: { operations: [1] }, requiresBearer: true, requiresDerive: true }, dirs());
    fs.writeFileSync(path.join(dir, '.drain.lock'), JSON.stringify({ pid: 1 }));
    const result = await drainQueue(AUTH, 500, dirs());
    expect(result.sent).toBe(0);
    expect(result.remaining).toBe(1);
    expect(postJsonMock).not.toHaveBeenCalled();
  });

  it('takes over a stale lock', async () => {
    enqueue({ url: 'http://x/w', body: { operations: [1] }, requiresBearer: true, requiresDerive: true }, dirs());
    const lock = path.join(dir, '.drain.lock');
    fs.writeFileSync(lock, JSON.stringify({ pid: 1 }));
    const stale = new Date(Date.now() - 16 * 60_000);
    fs.utimesSync(lock, stale, stale);
    postJsonMock.mockResolvedValue(ok());
    const result = await drainQueue(AUTH, 500, dirs());
    expect(result.sent).toBe(1);
  });

  it('removes malformed queue files', async () => {
    fs.writeFileSync(path.join(dir, '100-junk.json'), 'not json');
    const result = await drainQueue(AUTH, 500, dirs());
    expect(result.remaining).toBe(0);
    expect(queuedFiles()).toHaveLength(0);
  });
});

describe('pruneStaleFiles', () => {
  it('removes only matching files older than the cutoff', async () => {
    const { pruneStaleFiles } = await import('../src/lib/fsutil.js');
    const target = fs.mkdtempSync(path.join(os.tmpdir(), 'rd-prune-'));
    const oldFile = path.join(target, 'dead-session.jsonl');
    const newFile = path.join(target, 'live-session.jsonl');
    const other = path.join(target, 'state.json');
    for (const f of [oldFile, newFile, other]) fs.writeFileSync(f, 'x');
    const stale = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000);
    fs.utimesSync(oldFile, stale, stale);
    fs.utimesSync(other, stale, stale);
    const removed = pruneStaleFiles(target, 30 * 24 * 60 * 60 * 1000);
    expect(removed).toBe(1);
    expect(fs.existsSync(oldFile)).toBe(false);
    expect(fs.existsSync(newFile)).toBe(true);
    expect(fs.existsSync(other)).toBe(true);
  });

  it('returns 0 for a missing directory', async () => {
    const { pruneStaleFiles } = await import('../src/lib/fsutil.js');
    expect(pruneStaleFiles(path.join(os.tmpdir(), 'rd-prune-nope'), 1000)).toBe(0);
  });
});

describe('drainQueue rate limiting', () => {
  it('stops the whole drain on a 429 without charging attempts', async () => {
    enqueue({ url: 'http://x/w', body: { operations: [1] }, requiresBearer: true, requiresDerive: true }, dirs());
    enqueue({ url: 'http://x/w', body: { operations: [2] }, requiresBearer: true, requiresDerive: true }, dirs());
    postJsonMock.mockResolvedValue({ ok: false, status: 429, text: 'slow down', json: null });
    const result = await drainQueue(AUTH, 500, dirs());
    expect(postJsonMock).toHaveBeenCalledTimes(1);
    expect(result.failed).toBe(1);
    expect(queuedFiles()).toHaveLength(2);
    for (const f of queuedFiles()) expect(readEntry(f).attempts).toBeUndefined();
  });
});
