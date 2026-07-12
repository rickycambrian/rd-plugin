import { log } from './lib/log.js';
import { runCodexFlush } from './codex/flush-core.js';

/**
 * codex-flush — the detached worker spawned by codex-capture on a turn Stop.
 * Reads the session's pending events and writes to the resolved sink (direct =
 * CodexSession-family graph ops + D6 link; gateway = spool files; off =
 * nothing). Idempotent via a fingerprint in state.json. `--final` clears the
 * pending log after flushing. Fail-open always: exit 0.
 */
async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const codexSessionId = args.find((a) => !a.startsWith('--')) ?? 'unknown';
  const final = args.includes('--final');
  await runCodexFlush(codexSessionId, { final });
}

main()
  .catch((err) => {
    try { log('error', 'codex flush failed', { error: (err as Error).message }); } catch { /* ignore */ }
  })
  .finally(() => process.exit(0));
