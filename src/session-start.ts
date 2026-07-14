import { readHookInput } from './lib/hook-input.js';
import { loadConfig, resolveSink, shouldTrack } from './lib/config.js';
import { setLogLevel, log } from './lib/log.js';
import { gatherContextPack } from './lib/context-pack.js';
import { getDeriveHeaders, type DeriveHeaders } from './lib/derive.js';
import { pruneStaleFiles } from './lib/fsutil.js';
import { PENDING_DIR } from './lib/paths.js';
import { CODEX_PENDING_DIR } from './codex/paths.js';
import { recoverQuietPendingLogs } from './lib/recover.js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** Pending logs from sessions that died without a SessionEnd are GC'd here. */
const PENDING_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * session-start — SessionStart hook. Fetches a KFDB context pack for the
 * workspace and injects it via the SessionStart `additionalContext` channel.
 * Strictly fail-open with a hard 5s budget: on any failure it prints nothing
 * and exits 0. Never emits when the sink is off or the dir is excluded.
 */
async function main(): Promise<void> {
  const input = await readHookInput();
  const config = loadConfig();
  setLogLevel(config.log_level);

  const sink = resolveSink(config);
  if (sink === 'off' || !shouldTrack(config, input.cwd)) return;

  // GC pending logs from long-dead sessions (no SessionEnd → never cleared).
  const pruned = pruneStaleFiles(PENDING_DIR, PENDING_MAX_AGE_MS) + pruneStaleFiles(CODEX_PENDING_DIR, PENDING_MAX_AGE_MS);
  if (pruned > 0) log('info', 'pruned stale pending logs', { pruned });

  // Recover quiet pending logs before the GC above ever reaches them.
  // dist/session-start.mjs, flush.mjs, and codex-flush.mjs are bundled siblings.
  const here = path.dirname(fileURLToPath(import.meta.url));
  const recovered = recoverQuietPendingLogs(PENDING_DIR, path.join(here, 'flush.mjs'))
    + recoverQuietPendingLogs(CODEX_PENDING_DIR, path.join(here, 'codex-flush.mjs'));
  if (recovered > 0) log('info', 'spawned recovery flushes for quiet pending logs', { recovered });

  const cwd = input.cwd || process.cwd();
  const workspace = path.basename(cwd) || cwd;
  const language = detectLanguage(cwd);
  const query = [workspace, language, 'session start'].filter(Boolean).join(' ');

  // S2D headers when we can authenticate (preference/decision sheets are
  // wallet-scoped); public matches still work without them.
  let deriveHeaders: DeriveHeaders | undefined;
  if (config.private_key) {
    try {
      deriveHeaders = await getDeriveHeaders({ apiUrl: config.api_url, apiKey: config.api_key ?? '', privateKey: config.private_key });
    } catch (err) {
      log('debug', 'session-start derive failed (fail-open)', { error: (err as Error).message });
    }
  }

  const pack = await gatherContextPack({
    apiUrl: config.api_url,
    apiKey: config.api_key ?? '',
    deriveHeaders,
    query,
    context: language ? { language } : {},
    timeoutMs: 5000,
  });

  if (pack.text) {
    emitContext(pack.text);
    log('info', 'session-start injected', { sheetIds: pack.sheetIds.length, workspace });
  }
}

/** Emit the SessionStart additionalContext JSON envelope on stdout. */
function emitContext(text: string): void {
  const payload = {
    hookSpecificOutput: {
      hookEventName: 'SessionStart',
      additionalContext: text,
    },
  };
  process.stdout.write(JSON.stringify(payload));
}

const LANG_MARKERS: Array<{ file: string; language: string }> = [
  { file: 'package.json', language: 'typescript' },
  { file: 'tsconfig.json', language: 'typescript' },
  { file: 'pyproject.toml', language: 'python' },
  { file: 'requirements.txt', language: 'python' },
  { file: 'Cargo.toml', language: 'rust' },
  { file: 'go.mod', language: 'go' },
  { file: 'pom.xml', language: 'java' },
  { file: 'Gemfile', language: 'ruby' },
];

function detectLanguage(cwd: string): string | undefined {
  try {
    for (const marker of LANG_MARKERS) {
      if (fs.existsSync(path.join(cwd, marker.file))) return marker.language;
    }
  } catch {
    // fail-open
  }
  return undefined;
}

main()
  .catch((err) => {
    try { log('debug', 'session-start failed', { error: (err as Error).message }); } catch { /* ignore */ }
  })
  .finally(() => process.exit(0));
