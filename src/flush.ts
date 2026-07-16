import { loadConfig, resolveSink, type RdConfig } from './lib/config.js';
import { setLogLevel, log } from './lib/log.js';
import { readPending, clearPending } from './lib/pending.js';
import { readState, flushedEntry, setFlushedEntry, commitFlushedEntry, computeFingerprint, type FlushedEntry } from './lib/state.js';
import type { PendingEvent } from './lib/event.js';
import { parseTranscriptSummary, findTranscriptForSession, type TranscriptSummary } from './lib/transcript.js';
import { getDeriveHeaders, addressFromPrivateKey, type DeriveHeaders } from './lib/derive.js';
import { drainQueue } from './lib/queue.js';
import { kfdbAuthFromConfig } from './lib/kfdb-auth.js';
import { writeDirectUnit, writeGatewayUnit } from './lib/writer.js';
import { acquireFlushLock, acquireFlushLockOrWait, releaseFlushLock } from './lib/flush-lock.js';
import { PENDING_DIR } from './lib/paths.js';
import { wantsHelp } from './lib/cli-help.js';

const USAGE = `usage: node flush.mjs <sessionId> [--final]

Detached worker: flush a session's pending events to the resolved sink. Normally
spawned by capture on Stop/SessionEnd, not run by hand.

  <sessionId>   the session to flush
  --final       clear the pending log after flushing
  -h, --help    show this help and exit
`;

/**
 * flush — the detached worker spawned by capture on Stop/SessionEnd. Reads the
 * session's pending events + authoritative transcript, then writes to the
 * resolved sink (direct = graph + legacy stream; gateway = spool files; off =
 * nothing). Idempotent via a fingerprint in state.json so a Stop-then-SessionEnd
 * double-fire is harmless. Fail-open always: exit 0.
 */
async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (wantsHelp(args)) {
    process.stdout.write(USAGE);
    return;
  }
  const sessionId = args.find((a) => !a.startsWith('--')) ?? 'unknown';
  const final = args.includes('--final');

  const config = loadConfig();
  setLogLevel(config.log_level);

  const sink = resolveSink(config);
  if (sink === 'off') {
    log('debug', 'flush skipped: sink off', { sessionId });
    return;
  }

  const events = readPending(sessionId);
  if (events.length === 0) {
    log('debug', 'flush skipped: no pending events', { sessionId });
    return;
  }

  const claudeSessionId = events[0].claudeSessionId || sessionId;

  // Single flusher per session: overlapping Stop-hook flushes re-send the same
  // cumulative batches and amplify load when the backend is slow. Losers exit;
  // the next Stop hook retries. A final flush waits instead of skipping.
  if (final) {
    await acquireFlushLockOrWait(PENDING_DIR, claudeSessionId);
  } else if (!acquireFlushLock(PENDING_DIR, claudeSessionId)) {
    log('debug', 'flush skipped: another flush in progress', { sessionId: claudeSessionId });
    return;
  }

  try {
    const transcriptPath = resolveTranscriptPath(events, claudeSessionId);
    const summary = transcriptPath ? parseTranscriptSummary(transcriptPath) : undefined;

    const fingerprint = computeFingerprint(claudeSessionId, sink, events);
    const state = readState();
    const prior = flushedEntry(state, claudeSessionId);
    if (prior.fingerprint === fingerprint && !final) {
      // Refresh updatedAt so the recovery sweep stops re-selecting this log.
      await commitFlushedEntry(claudeSessionId, {});
      log('debug', 'flush skipped: unchanged fingerprint', { sessionId: claudeSessionId });
      return;
    }

    if (sink === 'gateway') {
      await flushGateway(claudeSessionId, events, summary);
    } else {
      await flushDirect(config, claudeSessionId, events, summary, transcriptPath, prior, state);
    }

    setFlushedEntry(state, claudeSessionId, { fingerprint });
    // Persist only this session's accumulated entry via a locked read-merge-write
    // — a whole-file writeState() here loses concurrent sessions' entries.
    await commitFlushedEntry(claudeSessionId, flushedEntry(state, claudeSessionId));

    // Only drop the pending log once the session has truly ended and been flushed.
    if (final) clearPending(claudeSessionId);
  } finally {
    releaseFlushLock(PENDING_DIR, claudeSessionId);
  }
}

function resolveTranscriptPath(events: PendingEvent[], claudeSessionId: string): string | undefined {
  for (let i = events.length - 1; i >= 0; i--) {
    if (events[i].transcriptPath) return events[i].transcriptPath;
  }
  return findTranscriptForSession(claudeSessionId);
}

/**
 * Gateway sink: no network, no config. Write one spool file per turn for the
 * gateway runner to ingest. RD_SPOOL_DIR is set by the runner.
 */
async function flushGateway(claudeSessionId: string, events: PendingEvent[], summary?: TranscriptSummary): Promise<void> {
  const spoolDir = process.env.RD_SPOOL_DIR;
  if (!spoolDir) {
    log('warn', 'gateway sink but RD_SPOOL_DIR unset', { sessionId: claudeSessionId });
    return;
  }
  // Gateway sink has no wallet locally — the runner injects the owning wallet.
  const walletAddress = (process.env.RD_WALLET_ADDRESS || '').toLowerCase();
  const written = writeGatewayUnit({ spoolDir, walletAddress, claudeSessionId, events, summary });
  log('info', 'gateway spool written', { sessionId: claudeSessionId, files: written.length });
}

/**
 * Direct sink: write schema-v3 graph ops (batched, S2D-authed) + the legacy
 * stream. Failed graph batches are queued; the legacy writer queues its own
 * failed posts. The queue is drained opportunistically first.
 */
async function flushDirect(
  config: RdConfig,
  claudeSessionId: string,
  events: PendingEvent[],
  summary: TranscriptSummary | undefined,
  transcriptPath: string | undefined,
  prior: FlushedEntry,
  state: ReturnType<typeof readState>,
): Promise<void> {
  if (!config.private_key) {
    log('warn', 'direct sink but no private_key', { sessionId: claudeSessionId });
    return;
  }
  const walletAddress = addressFromPrivateKey(config.private_key).toLowerCase();

  let deriveHeaders: DeriveHeaders | undefined;
  try {
    deriveHeaders = await getDeriveHeaders({ apiUrl: config.api_url, apiKey: config.api_key, privateKey: config.private_key });
  } catch (err) {
    log('warn', 'derive failed; queueing graph only', { sessionId: claudeSessionId, error: (err as Error).message });
  }
  const auth = kfdbAuthFromConfig(config, deriveHeaders);

  // Opportunistic queue drain (best-effort) once we have auth.
  if (deriveHeaders) {
    try {
      const drained = await drainQueue(auth);
      if (drained.sent > 0 || drained.remaining > 0) log('info', 'queue drained', drained as unknown as Record<string, unknown>);
    } catch { /* best-effort */ }
  }

  const result = await writeDirectUnit({
    config,
    walletAddress,
    auth,
    claudeSessionId,
    events,
    summary,
    transcriptPath,
    legacyStreamMaxSequence: prior.legacyStreamMaxSequence ?? -1,
    priorMessageCount: prior.lastMessageCount,
    priorToolCallCount: prior.lastToolCallCount,
  });
  log('info', 'flush direct complete', {
    sessionId: claudeSessionId,
    ops: result.ops,
    messages: result.messages,
    tools: result.tools,
    graphOk: result.graphOk,
    artifactOk: result.artifactOk,
    artifacts: result.artifacts,
    legacyOk: result.legacyOk,
  });

  setFlushedEntry(state, claudeSessionId, {
    legacyStreamMaxSequence: result.maxSequence,
    lastMessageCount: result.sessionMessageCount,
    lastToolCallCount: result.sessionToolCallCount,
  });
}

main()
  .catch((err) => {
    try { log('error', 'flush failed', { error: (err as Error).message }); } catch { /* ignore */ }
  })
  .finally(() => process.exit(0));
