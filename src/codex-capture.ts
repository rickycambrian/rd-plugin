import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readHookInput } from './lib/hook-input.js';
import { log } from './lib/log.js';
import { runCodexCapture } from './codex/capture-core.js';

/**
 * codex-capture — the fast per-event Codex hook. Appends exactly one JSON line
 * to the session's pending log and returns immediately (< 50ms, no network). On
 * a turn `Stop` it spawns `dist/codex-flush.mjs <sessionId>` detached + unref'd
 * so the flush runs after this process exits. Fail-open always: exit 0.
 */
async function main(): Promise<void> {
  const input = await readHookInput();
  const result = await runCodexCapture(input);
  if (result?.shouldFlush) {
    spawnDetachedFlush(result.codexSessionId);
  }
}

function spawnDetachedFlush(codexSessionId: string): void {
  try {
    // dist/codex-capture.mjs and dist/codex-flush.mjs are siblings.
    const here = path.dirname(fileURLToPath(import.meta.url));
    const flushScript = path.join(here, 'codex-flush.mjs');
    const child = spawn(process.execPath, [flushScript, codexSessionId], {
      detached: true,
      stdio: 'ignore',
      env: process.env,
    });
    child.unref();
  } catch (err) {
    log('warn', 'codex spawn flush failed', { error: (err as Error).message });
  }
}

main()
  .catch((err) => {
    try { log('error', 'codex capture failed', { error: (err as Error).message }); } catch { /* ignore */ }
  })
  .finally(() => process.exit(0));
