import path from 'node:path';
import { STATE_DIR, safeName } from '../lib/paths.js';

/**
 * Codex capture reuses the same ~/.rickydata state root as the Claude Code path
 * (shared state.json for flush idempotency, shared derive-session cache), but
 * keeps its fast-append pending logs in a sibling directory so the two capture
 * pipelines never read each other's event streams.
 */
export const CODEX_PENDING_DIR = path.join(STATE_DIR, 'codex-pending');

export function codexPendingFileFor(codexSessionId: string): string {
  return path.join(CODEX_PENDING_DIR, `${safeName(codexSessionId)}.jsonl`);
}
