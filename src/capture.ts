import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readHookInput, resolveClaudeSessionId } from './lib/hook-input.js';
import { toPendingEvent } from './lib/event.js';
import { appendPending, pendingCount } from './lib/pending.js';
import { loadConfig, resolveSink, shouldTrack } from './lib/config.js';
import { setLogLevel, log } from './lib/log.js';
import { wantsHelp } from './lib/cli-help.js';
import { ownedRepository } from './codex/repo.js';
import { spawnRickygitArm } from './lib/rickygit-arm.js';

const USAGE = `usage: node capture.mjs [--spawn-flush] [--final]

Fast per-event hook: append one pending event from the hook JSON on stdin.
Normally invoked by the harness, not run by hand.

  --spawn-flush   spawn a detached flush after appending
  --final         mark the spawned flush as the session's final (SessionEnd)
  -h, --help      show this help and exit
`;

/**
 * capture — the fast per-event hook. Appends exactly one JSON line to the
 * session's pending log and returns immediately. NO network here (< 50ms). On
 * `--spawn-flush` it also spawns `dist/flush.mjs <sessionId>` detached + unref'd
 * so the flush runs after this process exits. Fail-open always: exit 0.
 */
async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (wantsHelp(args)) {
    process.stdout.write(USAGE);
    return;
  }
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

  const sessionId = resolveClaudeSessionId(input);
  const sequence = pendingCount(sessionId);
  const repo = await ownedRepository(typeof input.cwd === 'string' ? input.cwd : undefined, null);
  const repository = repo ? {
    owner: repo.owner,
    repository: repo.repository,
    fullName: `${repo.owner}/${repo.repository}`,
    remoteUrl: repo.remoteUrl,
    branch: repo.branch,
    commitSha: repo.commitSha,
    treeHash: repo.treeHash,
    dirty: repo.dirty,
    dirtyStateHash: repo.dirtyStateHash,
  } : undefined;
  const event = toPendingEvent(input, sequence, repository);
  // UserPromptSubmit is the first lifecycle point where the exact objective is
  // observable. Arm rickydata_git asynchronously; its session-keyed adapter is
  // idempotent and reuses Home-launched attempts instead of minting duplicates.
  const gitArm = spawnRickygitArm(input);
  if (gitArm.status === 'started' && event.workProvenance) {
    event.workProvenance.gitArm = { status: 'started', binary: gitArm.binary };
  } else if (gitArm.status === 'rejected') {
    if (event.workProvenance) {
      event.workProvenance.gitArm = {
        status: 'rejected', binary: gitArm.binary, diagnosticCode: gitArm.diagnosticCode,
        missingFlags: gitArm.missingFlags, detail: gitArm.detail,
      };
    }
    log('error', 'rickygit provenance preflight rejected', gitArm);
  }
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
  .finally(() => {
    // Natural exit lets libuv finish launching detached provenance adapters.
    // A forced process.exit can discard a just-scheduled spawn before exec.
    process.exitCode = 0;
  });
