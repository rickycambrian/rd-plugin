import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { QUEUE_DIR, QUEUE_DEAD_DIR } from './paths.js';
import { postJson } from './http.js';
import { GRAPH_WRITE_TIMEOUT_MS } from './graph.js';
import { log } from './log.js';
import type { DeriveHeaders } from './derive.js';

/** A queued write is a fully-formed request the drain can replay verbatim. */
export interface QueuedRequest {
  url: string;
  body: unknown;
  /** Auth headers are re-derived at drain time; only non-secret headers persist. */
  requiresBearer: boolean;
  requiresDerive: boolean;
  queuedAt: string;
  /**
   * Stable identity for supersedable payloads (e.g. `graph:<sid>:<batchIdx>`).
   * A new enqueue with the same key REPLACES older queued files for that key:
   * graph batches are cumulative per (session, batch index), so the newest
   * content is always a superset of what it replaces. This is the primary
   * amplification guard — without it, every re-flush of a failing session
   * enqueued a fresh copy of each failed batch.
   */
  dedupeKey?: string;
  /** Failed replay attempts so far (drain bookkeeping). */
  attempts?: number;
  /** ISO time before which the drain must not retry this entry (backoff). */
  nextAttemptAt?: string;
  /** Truncated description of the last failure, for /rd-status forensics. */
  lastError?: string;
}

/** Retry policy. Transient failures (5xx, timeouts, network) get the full
 * ladder; 4xx (except 408/429) are treated as near-permanent and dead-letter
 * fast so a poison payload can't occupy the queue for days. */
const MAX_ATTEMPTS_TRANSIENT = 12;
const MAX_ATTEMPTS_PERMANENT = 3;
const BACKOFF_BASE_MS = 30_000;
const BACKOFF_CAP_MS = 4 * 60 * 60 * 1000;
/** Batches larger than this are split in two on a client timeout instead of
 * retried whole — a degraded server that can't commit 900 ops in 60s can
 * usually commit 450, and the halves converge to a committable size. */
const SPLIT_MIN_OPS = 60;
/** An opportunistic drain (from a flush) must not run unbounded. */
const DEFAULT_DRAIN_BUDGET_MS = 4 * 60_000;
/** A drain lock older than this is presumed dead and is taken over. */
const DRAIN_LOCK_STALE_MS = 15 * 60_000;

const HASH_RE = /-c([0-9a-f]{16})\.json$/;

function hash16(input: string): string {
  return createHash('sha256').update(input).digest('hex').slice(0, 16);
}

function contentHashOf(request: Pick<QueuedRequest, 'url' | 'body'>): string {
  return hash16(`${request.url}\n${JSON.stringify(request.body)}`);
}

export interface QueueDirs {
  dir?: string;
  deadDir?: string;
}

/**
 * Enqueue a request for a later drain. Content-identical entries are never
 * duplicated (the existing file keeps its retry state); entries with a
 * `dedupeKey` replace any older queued files for the same key. Never throws.
 */
export function enqueue(
  request: Omit<QueuedRequest, 'queuedAt' | 'attempts' | 'nextAttemptAt' | 'lastError'>,
  dirs: QueueDirs = {},
): void {
  const dir = dirs.dir ?? QUEUE_DIR;
  try {
    fs.mkdirSync(dir, { recursive: true });
    const contentHash = contentHashOf(request);
    const keyHash = request.dedupeKey ? hash16(request.dedupeKey) : undefined;
    let existing: string[] = [];
    try {
      existing = fs.readdirSync(dir).filter((f) => f.endsWith('.json'));
    } catch { /* fresh dir */ }
    if (existing.some((f) => f.includes(`-c${contentHash}.json`))) {
      log('debug', 'enqueue skipped: identical entry already queued', { contentHash });
      return;
    }
    if (keyHash) {
      const superseded = existing.filter((f) => f.includes(`-k${keyHash}-`));
      for (const f of superseded) {
        try { fs.rmSync(path.join(dir, f), { force: true }); } catch { /* ignore */ }
      }
      if (superseded.length > 0) {
        log('debug', 'enqueue superseded older entries', { dedupeKey: request.dedupeKey, replaced: superseded.length });
      }
    }
    const rand = Math.random().toString(36).slice(2, 10);
    const keySegment = keyHash ? `-k${keyHash}` : '';
    const name = `${Date.now()}-${rand}${keySegment}-c${contentHash}.json`;
    const entry: QueuedRequest = { ...request, queuedAt: new Date().toISOString() };
    fs.writeFileSync(path.join(dir, name), JSON.stringify(entry), { mode: 0o600 });
  } catch (err) {
    log('warn', 'enqueue failed', { error: (err as Error).message });
  }
}

export interface DrainAuth {
  apiKey?: string;
  deriveHeaders?: DeriveHeaders;
}

export interface DrainResult {
  sent: number;
  failed: number;
  remaining: number;
  /** Entries skipped because their backoff window hasn't elapsed. */
  deferred: number;
  /** Duplicate files removed because identical content was sent this drain. */
  deduped: number;
  /** Entries that exhausted retries and moved to the dead-letter dir. */
  deadLettered: number;
  /** Timed-out batches split in two for the next drain. */
  split: number;
}

export interface DrainOptions extends QueueDirs {
  /** Wall-clock budget; the drain stops attempting new entries once elapsed. */
  maxMs?: number;
}

function classifyStatus(status: number): 'permanent' | 'transient' {
  if (status >= 400 && status < 500 && status !== 408 && status !== 429) return 'permanent';
  return 'transient';
}

function backoffMs(attempts: number): number {
  const base = Math.min(BACKOFF_BASE_MS * 2 ** Math.max(0, attempts - 1), BACKOFF_CAP_MS);
  return Math.round(base * (0.8 + Math.random() * 0.4));
}

function recordFailure(
  full: string,
  entry: QueuedRequest,
  error: string,
  kind: 'permanent' | 'transient',
  deadDir: string,
): 'retained' | 'deadLettered' {
  const attempts = (entry.attempts ?? 0) + 1;
  const maxAttempts = kind === 'permanent' ? MAX_ATTEMPTS_PERMANENT : MAX_ATTEMPTS_TRANSIENT;
  if (attempts >= maxAttempts) {
    try {
      fs.mkdirSync(deadDir, { recursive: true });
      fs.renameSync(full, path.join(deadDir, path.basename(full)));
      log('warn', 'queue entry dead-lettered', { file: path.basename(full), attempts, error: error.slice(0, 200) });
      return 'deadLettered';
    } catch { /* fall through to retain */ }
  }
  try {
    const updated: QueuedRequest = {
      ...entry,
      attempts,
      nextAttemptAt: new Date(Date.now() + backoffMs(attempts)).toISOString(),
      lastError: error.slice(0, 300),
    };
    fs.writeFileSync(full, JSON.stringify(updated), { mode: 0o600 });
  } catch { /* ignore — entry stays as-is and retries next drain */ }
  return 'retained';
}

/** Split a timed-out operations batch into ordered halves for the next drain. */
function splitEntry(dir: string, full: string, entry: QueuedRequest, operations: unknown[]): boolean {
  try {
    const mid = Math.ceil(operations.length / 2);
    const halves = [operations.slice(0, mid), operations.slice(mid)];
    const tsPrefix = path.basename(full).split('-')[0] || `${Date.now()}`;
    const rand = Math.random().toString(36).slice(2, 10);
    halves.forEach((ops, i) => {
      const body = { ...(entry.body as Record<string, unknown>), operations: ops };
      const request: QueuedRequest = {
        url: entry.url,
        body,
        requiresBearer: entry.requiresBearer,
        requiresDerive: entry.requiresDerive,
        queuedAt: entry.queuedAt,
        // Halves keep the original's retry state but drop its dedupeKey: a
        // later full-size enqueue for that key must not delete partial halves.
        attempts: entry.attempts,
        nextAttemptAt: new Date(Date.now() + BACKOFF_BASE_MS).toISOString(),
        lastError: `split after timeout at ${operations.length} ops`,
      };
      const name = `${tsPrefix}-${rand}${i}-c${contentHashOf(request)}.json`;
      fs.writeFileSync(path.join(dir, name), JSON.stringify(request), { mode: 0o600 });
    });
    fs.rmSync(full, { force: true });
    return true;
  } catch (err) {
    log('warn', 'queue split failed', { error: (err as Error).message });
    return false;
  }
}

function countQueue(dir: string): number {
  try {
    return fs.readdirSync(dir).filter((f) => f.endsWith('.json')).length;
  } catch {
    return 0;
  }
}

/**
 * Replay queued requests, re-attaching auth at send time (secrets are never
 * written to disk). Deletes each file on a 2xx; on failure applies exponential
 * backoff, dead-letters after the attempt ceiling, and splits timed-out
 * operation batches in half so they converge to a committable size. Identical
 * content is only attempted once per drain (duplicates removed on success).
 * A lock file keeps concurrent flushes from draining in parallel. Never throws.
 */
export async function drainQueue(auth: DrainAuth, limit = 500, options: DrainOptions = {}): Promise<DrainResult> {
  const dir = options.dir ?? QUEUE_DIR;
  const deadDir = options.deadDir ?? QUEUE_DEAD_DIR;
  const maxMs = options.maxMs ?? DEFAULT_DRAIN_BUDGET_MS;
  const result: DrainResult = { sent: 0, failed: 0, remaining: 0, deferred: 0, deduped: 0, deadLettered: 0, split: 0 };

  let files: string[];
  try {
    files = fs.readdirSync(dir).filter((f) => f.endsWith('.json'));
  } catch {
    return result;
  }
  if (files.length === 0) return result;

  // Single-drainer lock: concurrent flushes each draining the same backlog
  // multiplies load on an already-struggling server for zero extra progress.
  const lockPath = path.join(dir, '.drain.lock');
  try {
    const stat = fs.statSync(lockPath);
    if (Date.now() - stat.mtimeMs < DRAIN_LOCK_STALE_MS) {
      log('debug', 'drain skipped: another drain holds the lock');
      result.remaining = files.length;
      return result;
    }
  } catch { /* no lock */ }
  try {
    fs.writeFileSync(lockPath, JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() }), { mode: 0o600 });
  } catch { /* lock is best-effort */ }

  const startedAt = Date.now();
  const sentHashes = new Set<string>();
  const failedHashes = new Set<string>();
  try {
    files.sort();
    let attempted = 0;
    for (const file of files) {
      if (attempted >= limit) break;
      if (Date.now() - startedAt > maxMs) {
        log('info', 'drain budget exhausted', { attempted, budgetMs: maxMs });
        break;
      }
      const full = path.join(dir, file);
      let entry: QueuedRequest;
      try {
        entry = JSON.parse(fs.readFileSync(full, 'utf8')) as QueuedRequest;
      } catch {
        try { fs.rmSync(full, { force: true }); } catch { /* ignore */ }
        continue;
      }
      if (entry.nextAttemptAt && Date.parse(entry.nextAttemptAt) > Date.now()) {
        result.deferred += 1;
        continue;
      }
      const contentHash = HASH_RE.exec(file)?.[1] ?? contentHashOf(entry);
      if (sentHashes.has(contentHash)) {
        try { fs.rmSync(full, { force: true }); } catch { /* ignore */ }
        result.deduped += 1;
        continue;
      }
      if (failedHashes.has(contentHash)) {
        result.deferred += 1;
        continue;
      }
      const headers: Record<string, string> = {};
      if (entry.requiresBearer && auth.apiKey) headers.Authorization = `Bearer ${auth.apiKey}`;
      if (entry.requiresDerive && auth.deriveHeaders) Object.assign(headers, auth.deriveHeaders);
      if ((entry.requiresBearer && !auth.apiKey) || (entry.requiresDerive && !auth.deriveHeaders)) {
        // Can't authenticate right now — leave for a later drain.
        result.failed += 1;
        continue;
      }
      attempted += 1;
      try {
        // Replay at the graph-write timeout (60s), NOT postJson's 15s default: a
        // drain that replays at a shorter timeout than the writer that queued the
        // entry can never make progress on batches the server takes ~10-20s to run.
        const response = await postJson(entry.url, entry.body, headers, GRAPH_WRITE_TIMEOUT_MS);
        if (response.ok) {
          fs.rmSync(full, { force: true });
          result.sent += 1;
          sentHashes.add(contentHash);
        } else if (response.status === 429) {
          // The server asked us to slow down — attempting further entries
          // burns the shared rate budget for zero progress (and starves live
          // flushes). Stop the whole drain; don't charge the entry an attempt.
          result.failed += 1;
          log('info', 'drain stopped: server rate-limited (429)', { attempted });
          break;
        } else {
          result.failed += 1;
          failedHashes.add(contentHash);
          const outcome = recordFailure(
            full, entry, `HTTP ${response.status}: ${response.text.slice(0, 200)}`,
            classifyStatus(response.status), deadDir,
          );
          if (outcome === 'deadLettered') result.deadLettered += 1;
        }
      } catch (err) {
        const error = err as Error;
        result.failed += 1;
        failedHashes.add(contentHash);
        const isTimeout = error.name === 'AbortError' || error.name === 'TimeoutError';
        const body = entry.body as { operations?: unknown[] } | null;
        const operations = body && Array.isArray(body.operations) ? body.operations : undefined;
        if (isTimeout && operations && operations.length >= SPLIT_MIN_OPS) {
          if (splitEntry(dir, full, entry, operations)) {
            result.split += 1;
            log('info', 'queue entry split after timeout', { file, ops: operations.length });
            continue;
          }
        }
        const outcome = recordFailure(full, entry, error.message || String(error), 'transient', deadDir);
        if (outcome === 'deadLettered') result.deadLettered += 1;
      }
    }
  } finally {
    try { fs.rmSync(lockPath, { force: true }); } catch { /* ignore */ }
  }
  result.remaining = countQueue(dir);
  return result;
}

export function queueSize(dirs: QueueDirs = {}): number {
  return countQueue(dirs.dir ?? QUEUE_DIR);
}
