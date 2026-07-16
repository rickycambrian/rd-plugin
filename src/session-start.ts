import { readHookInput } from './lib/hook-input.js';
import { loadConfig, resolveSink, shouldTrack } from './lib/config.js';
import { setLogLevel, log } from './lib/log.js';
import { gatherContextPack } from './lib/context-pack.js';
import { getDeriveHeaders, type DeriveHeaders } from './lib/derive.js';
import { mintHomeWalletToken } from './lib/home-auth.js';
import { pruneStaleFiles } from './lib/fsutil.js';
import { PENDING_DIR } from './lib/paths.js';
import { CODEX_PENDING_DIR } from './codex/paths.js';
import { recoverQuietPendingLogs } from './lib/recover.js';
import { writeAll } from './lib/stdout.js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { appendPending, pendingCount } from './lib/pending.js';
import { toPendingEvent } from './lib/event.js';
import { ownedRepository } from './codex/repo.js';

/** Pending logs from sessions that died without a SessionEnd are GC'd here. */
const PENDING_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * session-start — SessionStart hook. Fetches a KFDB context pack for the
 * workspace and injects it via the SessionStart `additionalContext` channel.
 * Strictly fail-open with a bounded 8.5s context budget: on any failure it
 * emits only an explicitly-INCOMPLETE fallback and exits 0. The wider bound is
 * live-earned from a cold complete Home compile; warm SWR reads remain fast.
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
  const repo = await ownedRepository(cwd, null);
  const language = detectLanguage(cwd);
  const query = [workspace, language, 'session start'].filter(Boolean).join(' ');

  // S2D headers when we can authenticate (preference/decision sheets are
  // wallet-scoped); public matches still work without them.
  let deriveHeaders: DeriveHeaders | undefined;
  let homeToken: string | undefined;
  if (config.private_key) {
    try {
      [deriveHeaders, homeToken] = await Promise.all([
        getDeriveHeaders({ apiUrl: config.api_url, apiKey: config.api_key ?? '', privateKey: config.private_key }),
        mintHomeWalletToken(config.private_key),
      ]);
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
    timeoutMs: 8500,
    homeUrl: config.home_url,
    homeToken,
    repoId: repo?.repository ?? workspace,
    homeBudget: 4_000,
  });

  if (pack.text) {
    await emitContext(pack.text);
    const sessionId = typeof input.session_id === 'string' && input.session_id ? input.session_id : 'unknown';
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
    const deliveryEvent = toPendingEvent({ ...input, hook_event_name: 'ContextDelivery' }, pendingCount(sessionId), repository);
    deliveryEvent.contextDelivery = {
      deliveryKey: `session-start:${sessionId}`,
      ...(pack.packId ? { packId: pack.packId } : {}),
      ...(pack.reproducibilityHash && /^[0-9a-f]{64}$/.test(pack.reproducibilityHash)
        ? { packHash: `sha256:${pack.reproducibilityHash}` as const }
        : {}),
      renderedContent: pack.text,
      interface: 'claude-code-session-start-warm',
      coverageStatus: pack.coverageStatus,
      omissions: pack.omissions,
      deliveredAt: new Date().toISOString(),
      policyHash: pack.policyHash,
      selectedManifestHash: pack.selectedManifestHash,
      corpusWatermark: pack.corpusWatermark,
    };
    appendPending(sessionId, deliveryEvent);
    log('info', 'session-start injected', {
      sheetIds: pack.sheetIds.length,
      workspace,
      contextSource: pack.source,
      coverageStatus: pack.coverageStatus,
      reproducibilityHash: pack.reproducibilityHash,
      deliveryReceiptQueued: true,
    });
  }
}

/** Emit the SessionStart additionalContext JSON envelope on stdout. */
async function emitContext(text: string): Promise<void> {
  const payload = {
    hookSpecificOutput: {
      hookEventName: 'SessionStart',
      additionalContext: text,
    },
  };
  await writeAll(process.stdout, JSON.stringify(payload));
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
  .finally(() => {
    // A complete Home pack is tens of kilobytes. Forced exit truncated stdout
    // mid-JSON on a real SessionStart; a natural exit preserves the flush above.
    process.exitCode = 0;
  });
