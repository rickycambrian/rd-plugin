import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readHookInput } from './lib/hook-input.js';
import { toPendingEvent } from './lib/event.js';
import { appendPending, pendingCount } from './lib/pending.js';
import { loadConfig, resolveSink, shouldTrack } from './lib/config.js';
import { setLogLevel, log } from './lib/log.js';

/**
 * capture — the fast per-event hook. Appends exactly one JSON line to the
 * session's pending log and returns immediately. NO network here (< 50ms). On
 * `--spawn-flush` it also spawns `dist/flush.mjs <sessionId>` detached + unref'd
 * so the flush runs after this process exits. Fail-open always: exit 0.
 */
async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const spawnFlush = args.includes('--spawn-flush');
  const final = args.includes('--final');

  const input = await readHookInput();
  const config = loadConfig();
  setLogLevel(config.log_level);

  const sink = resolveSink(config);
  // `off` sink or excluded/disabled dir → do nothing at all.
  if (sink === 'off' || !shouldTrack(config, input.cwd)) {
    return;
  }

  const sessionId = typeof input.session_id === 'string' && input.session_id ? input.session_id : 'unknown';
  const sequence = pendingCount(sessionId);
  const event = toPendingEvent(input, sequence);
  appendPending(sessionId, event);

  if (spawnFlush) {
    spawnDetachedFlush(sessionId, final);
  }
}

function spawnDetachedFlush(sessionId: string, final: boolean): void {
  try {
    // dist/capture.mjs and dist/flush.mjs are siblings in the bundled output.
    const here = path.dirname(fileURLToPath(import.meta.url));
    const flushScript = path.join(here, 'flush.mjs');
    const flushArgs = [flushScript, sessionId];
    if (final) flushArgs.push('--final');
    const child = spawn(process.execPath, flushArgs, {
      detached: true,
      stdio: 'ignore',
      env: process.env,
    });
    child.unref();
  } catch (err) {
    log('warn', 'spawn flush failed', { error: (err as Error).message });
  }
}

main()
  .catch((err) => {
    try { log('error', 'capture failed', { error: (err as Error).message }); } catch { /* ignore */ }
  })
  .finally(() => process.exit(0));
