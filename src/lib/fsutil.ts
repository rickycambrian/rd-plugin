import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export function sha256Hex(input: string): string {
  return crypto.createHash('sha256').update(input).digest('hex');
}

export function readJsonFile<T>(filePath: string, fallback: T): T {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T;
  } catch {
    return fallback;
  }
}

/** Atomic JSON write: write a unique tmp file then rename over the target. */
export function writeJsonFileAtomic(filePath: string, data: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.tmp.${process.pid}.${Math.random().toString(36).slice(2)}`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), { mode: 0o600 });
  fs.renameSync(tmp, filePath);
}

/** Atomic write of an arbitrary string body (tmp + rename). */
export function writeFileAtomic(filePath: string, body: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.tmp.${process.pid}.${Math.random().toString(36).slice(2)}`;
  fs.writeFileSync(tmp, body, { mode: 0o600 });
  fs.renameSync(tmp, filePath);
}

/**
 * Remove files in `dir` whose mtime is older than `maxAgeMs`. Used to garbage-
 * collect pending event logs from sessions that died without a SessionEnd
 * (their `--final` flush never ran, so `clearPending` never fired) — without
 * GC these accumulate forever. Best-effort: returns the number removed, never
 * throws. Only prunes files matching `suffix` so unrelated files are safe.
 */
export function pruneStaleFiles(dir: string, maxAgeMs: number, suffix = '.jsonl'): number {
  let removed = 0;
  try {
    const cutoff = Date.now() - maxAgeMs;
    for (const name of fs.readdirSync(dir)) {
      if (!name.endsWith(suffix)) continue;
      const full = path.join(dir, name);
      try {
        if (fs.statSync(full).mtimeMs < cutoff) {
          fs.rmSync(full, { force: true });
          removed += 1;
        }
      } catch { /* ignore per-file races */ }
    }
  } catch { /* no dir — nothing to prune */ }
  return removed;
}
