import { log } from './lib/log.js';
import { runCodexFlush } from './codex/flush-core.js';
import { wantsHelp } from './lib/cli-help.js';

const USAGE = `usage: node codex-flush.mjs <codexSessionId> [--final]

Detached worker: flush a Codex session's pending events to the resolved sink.
Normally spawned by codex-capture on a turn Stop, not run by hand.

  <codexSessionId>  the Codex session to flush
  --final           clear the pending log after flushing
  -h, --help        show this help and exit
`;

/**
 * codex-flush — the detached worker spawned by codex-capture on a turn Stop.
 * Reads the session's pending events and writes to the resolved sink (direct =
 * CodexSession-family graph ops + D6 link; gateway = spool files; off =
 * nothing). Idempotent via a fingerprint in state.json. `--final` clears the
 * pending log after flushing. Fail-open always: exit 0.
 */
async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (wantsHelp(args)) {
    process.stdout.write(USAGE);
    return;
  }
  const codexSessionId = args.find((a) => !a.startsWith('--')) ?? 'unknown';
  const final = args.includes('--final');
  await runCodexFlush(codexSessionId, { final });
}

main()
  .catch((err) => {
    try { log('error', 'codex flush failed', { error: (err as Error).message }); } catch { /* ignore */ }
  })
  .finally(() => process.exit(0));
