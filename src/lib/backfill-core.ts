/**
 * Pure selection logic for backfill: given the discovered transcript files and
 * the resume state, decide which sessions to replay this run and in what order.
 * Kept IO-free so it can be unit-tested (watermark + since + limit + dedup).
 */

export interface DiscoveredSession {
  file: string;
  id: string;
  mtimeMs: number;
}

export interface SelectOptions {
  /** Epoch ms lower bound (inclusive); undefined = no lower bound. */
  since?: number;
  /** Max sessions to return. */
  limit: number;
  /** Ids already backfilled (skipped). */
  done: Record<string, true>;
}

/**
 * Oldest-first selection so the resume watermark advances monotonically:
 * filter by `since`, drop already-done ids, sort ascending by mtime, cap at
 * `limit`.
 */
export function selectBackfillCandidates(files: DiscoveredSession[], opts: SelectOptions): DiscoveredSession[] {
  return files
    .filter((s) => (opts.since === undefined ? true : s.mtimeMs >= opts.since))
    .filter((s) => !opts.done[s.id])
    .sort((a, b) => a.mtimeMs - b.mtimeMs)
    .slice(0, Math.max(0, opts.limit));
}
