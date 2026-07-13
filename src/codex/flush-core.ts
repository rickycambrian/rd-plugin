import { loadConfig, resolveSink } from '../lib/config.js';
import { setLogLevel, log } from '../lib/log.js';
import { readState, writeState, flushedEntry, setFlushedEntry } from '../lib/state.js';
import { sha256Hex } from '../lib/fsutil.js';
import { getDeriveHeaders, addressFromPrivateKey, type DeriveHeaders } from '../lib/derive.js';
import { drainQueue } from '../lib/queue.js';
import { acquireFlushLock, acquireFlushLockOrWait, releaseFlushLock } from '../lib/flush-lock.js';
import { readCodexPending, clearCodexPending } from './pending.js';
import { CODEX_PENDING_DIR } from './paths.js';
import type { CodexPendingEvent } from './event.js';
import { RD_CODEX_AGENT_ID } from './config.js';
import { writeCodexDirectUnit, writeCodexGatewayUnit } from './writer.js';

/**
 * Fingerprint of a Codex flush unit: stable across re-reads of the same pending
 * log, changes the moment a new event arrives. Drives idempotency so a repeated
 * Stop flush with an identical event set is a no-op.
 */
function codexFingerprint(codexSessionId: string, sink: string, events: CodexPendingEvent[]): string {
  const shape = events.map((e) => `${e.sequence}:${e.hookEventName}:${e.toolUseId ?? ''}`).join('|');
  return sha256Hex(`codex ${codexSessionId} ${sink} ${events.length} ${shape}`);
}

/**
 * Codex flush core: read the session's pending events, then write to the
 * resolved sink (direct = CodexSession-family graph ops; gateway = spool files;
 * off = nothing). Idempotent via a fingerprint in the shared state.json.
 * Fail-open is the caller's responsibility (entrypoint wraps + exits 0).
 */
export async function runCodexFlush(
  codexSessionId: string,
  opts: { final: boolean },
  env: NodeJS.ProcessEnv = process.env,
): Promise<void> {
  const config = loadConfig();
  setLogLevel(config.log_level);

  const sink = resolveSink(config, env);
  if (sink === 'off') {
    log('debug', 'codex flush skipped: sink off', { sessionId: codexSessionId });
    return;
  }

  const events = readCodexPending(codexSessionId);
  if (events.length === 0) {
    log('debug', 'codex flush skipped: no pending events', { sessionId: codexSessionId });
    return;
  }

  // Single flusher per session (see lib/flush-lock.ts).
  if (opts.final) {
    await acquireFlushLockOrWait(CODEX_PENDING_DIR, codexSessionId);
  } else if (!acquireFlushLock(CODEX_PENDING_DIR, codexSessionId)) {
    log('debug', 'codex flush skipped: another flush in progress', { sessionId: codexSessionId });
    return;
  }

  try {
    const fingerprint = codexFingerprint(codexSessionId, sink, events);
    const state = readState();
    const prior = flushedEntry(state, codexSessionId);
    if (prior.fingerprint === fingerprint && !opts.final) {
      log('debug', 'codex flush skipped: unchanged fingerprint', { sessionId: codexSessionId });
      return;
    }

    if (sink === 'gateway') {
      flushCodexGateway(codexSessionId, events, env);
    } else {
      await flushCodexDirect(config, codexSessionId, events);
    }

    setFlushedEntry(state, codexSessionId, { fingerprint });
    writeState(state);

    if (opts.final) clearCodexPending(codexSessionId);
  } finally {
    releaseFlushLock(CODEX_PENDING_DIR, codexSessionId);
  }
}

function flushCodexGateway(codexSessionId: string, events: CodexPendingEvent[], env: NodeJS.ProcessEnv): void {
  const spoolDir = env.RD_SPOOL_DIR;
  if (!spoolDir) {
    log('warn', 'codex gateway sink but RD_SPOOL_DIR unset', { sessionId: codexSessionId });
    return;
  }
  const walletAddress = (env.RD_WALLET_ADDRESS || '').toLowerCase();
  const written = writeCodexGatewayUnit({ spoolDir, walletAddress, agentId: RD_CODEX_AGENT_ID, codexSessionId, events });
  log('info', 'codex gateway spool written', { sessionId: codexSessionId, files: written.length });
}

async function flushCodexDirect(
  config: ReturnType<typeof loadConfig>,
  codexSessionId: string,
  events: CodexPendingEvent[],
): Promise<void> {
  if (!config.private_key) {
    log('warn', 'codex direct sink but no private_key', { sessionId: codexSessionId });
    return;
  }
  const apiKey = config.api_key ?? '';
  const walletAddress = addressFromPrivateKey(config.private_key).toLowerCase();

  let deriveHeaders: DeriveHeaders | undefined;
  try {
    deriveHeaders = await getDeriveHeaders({ apiUrl: config.api_url, apiKey, privateKey: config.private_key });
  } catch (err) {
    log('warn', 'codex derive failed; queueing graph only', { sessionId: codexSessionId, error: (err as Error).message });
  }

  if (deriveHeaders) {
    try {
      const drained = await drainQueue({ apiKey, deriveHeaders });
      if (drained.sent > 0 || drained.remaining > 0) log('info', 'queue drained', drained as unknown as Record<string, unknown>);
    } catch { /* best-effort */ }
  }

  const result = await writeCodexDirectUnit({
    config,
    walletAddress,
    agentId: RD_CODEX_AGENT_ID,
    apiKey,
    deriveHeaders,
    codexSessionId,
    events,
  });
  log('info', 'codex flush direct complete', {
    sessionId: codexSessionId,
    ops: result.ops,
    graphOk: result.graphOk,
  });
}
