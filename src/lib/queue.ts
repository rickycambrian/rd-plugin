import fs from 'node:fs';
import path from 'node:path';
import { QUEUE_DIR } from './paths.js';
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
}

export function enqueue(request: Omit<QueuedRequest, 'queuedAt'>): void {
  try {
    fs.mkdirSync(QUEUE_DIR, { recursive: true });
    const name = `${Date.now()}-${Math.random().toString(36).slice(2)}.json`;
    const entry: QueuedRequest = { ...request, queuedAt: new Date().toISOString() };
    fs.writeFileSync(path.join(QUEUE_DIR, name), JSON.stringify(entry), { mode: 0o600 });
  } catch (err) {
    log('warn', 'enqueue failed', { error: (err as Error).message });
  }
}

export interface DrainAuth {
  apiKey?: string;
  deriveHeaders?: DeriveHeaders;
}

/**
 * Replay queued requests, re-attaching auth at send time (secrets are never
 * written to disk). Deletes each file on a 2xx; leaves it for the next drain on
 * failure. Returns counts. Never throws.
 */
export async function drainQueue(auth: DrainAuth, limit = 500): Promise<{ sent: number; failed: number; remaining: number }> {
  let sent = 0;
  let failed = 0;
  let files: string[];
  try {
    files = fs.readdirSync(QUEUE_DIR).filter((f) => f.endsWith('.json'));
  } catch {
    return { sent: 0, failed: 0, remaining: 0 };
  }
  files.sort();
  const batch = files.slice(0, limit);
  for (const file of batch) {
    const full = path.join(QUEUE_DIR, file);
    let request: QueuedRequest;
    try {
      request = JSON.parse(fs.readFileSync(full, 'utf8')) as QueuedRequest;
    } catch {
      try { fs.rmSync(full, { force: true }); } catch { /* ignore */ }
      continue;
    }
    const headers: Record<string, string> = {};
    if (request.requiresBearer && auth.apiKey) headers.Authorization = `Bearer ${auth.apiKey}`;
    if (request.requiresDerive && auth.deriveHeaders) Object.assign(headers, auth.deriveHeaders);
    if ((request.requiresBearer && !auth.apiKey) || (request.requiresDerive && !auth.deriveHeaders)) {
      // Can't authenticate right now — leave for a later drain.
      failed += 1;
      continue;
    }
    try {
      // Replay at the graph-write timeout (60s), NOT postJson's 15s default: a
      // drain that replays at a shorter timeout than the writer that queued the
      // entry can never make progress on batches the server takes ~10-20s to run.
      const result = await postJson(request.url, request.body, headers, GRAPH_WRITE_TIMEOUT_MS);
      if (result.ok) {
        fs.rmSync(full, { force: true });
        sent += 1;
      } else {
        failed += 1;
      }
    } catch {
      failed += 1;
    }
  }
  let remaining = 0;
  try {
    remaining = fs.readdirSync(QUEUE_DIR).filter((f) => f.endsWith('.json')).length;
  } catch {
    remaining = 0;
  }
  return { sent, failed, remaining };
}

export function queueSize(): number {
  try {
    return fs.readdirSync(QUEUE_DIR).filter((f) => f.endsWith('.json')).length;
  } catch {
    return 0;
  }
}
