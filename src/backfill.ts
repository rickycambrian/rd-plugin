import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadConfig, resolveSink } from './lib/config.js';
import { setLogLevel, log } from './lib/log.js';
import { readState, writeState } from './lib/state.js';
import { parseTranscriptSummary, transcriptToEvents } from './lib/transcript.js';
import { getDeriveHeaders, addressFromPrivateKey, type DeriveHeaders } from './lib/derive.js';
import { writeDirectUnit, writeGatewayUnit } from './lib/writer.js';
import { selectBackfillCandidates, type DiscoveredSession } from './lib/backfill-core.js';

/**
 * backfill — replay historical Claude Code transcripts (~/.claude/projects/​**​/*.jsonl)
 * through the same flush write path so past sessions land in the graph. Resumable
 * via a per-session watermark in state.json; gentle inter-session sleep to respect
 * the per-wallet rate limiter. Usage:
 *   node backfill.mjs [--since <ISO-date>] [--limit <n>] [--sleep <ms>]
 * Fail-open: exit 0.
 */
type SessionFile = DiscoveredSession;

function parseArgs(args: string[]): { since?: number; limit: number; sleepMs: number } {
  const get = (flag: string): string | undefined => {
    const i = args.indexOf(flag);
    return i >= 0 && i + 1 < args.length ? args[i + 1] : undefined;
  };
  const sinceRaw = get('--since');
  const since = sinceRaw ? Date.parse(sinceRaw) : NaN;
  const limitRaw = get('--limit');
  const sleepRaw = get('--sleep');
  return {
    since: Number.isNaN(since) ? undefined : since,
    limit: limitRaw ? Math.max(1, parseInt(limitRaw, 10) || 0) : 100,
    sleepMs: sleepRaw ? Math.max(0, parseInt(sleepRaw, 10) || 0) : 1000,
  };
}

function collectSessionFiles(): SessionFile[] {
  const projectsDir = path.join(os.homedir(), '.claude', 'projects');
  const out: SessionFile[] = [];
  const stack = [projectsDir];
  while (stack.length > 0) {
    const dir = stack.pop() as string;
    let dirents: fs.Dirent[];
    try {
      dirents = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const dirent of dirents) {
      const full = path.join(dir, dirent.name);
      if (dirent.isDirectory()) {
        stack.push(full);
      } else if (dirent.isFile() && dirent.name.endsWith('.jsonl')) {
        try {
          const stat = fs.statSync(full);
          out.push({ file: full, id: dirent.name.replace(/\.jsonl$/, ''), mtimeMs: stat.mtimeMs });
        } catch {
          // skip unreadable file
        }
      }
    }
  }
  return out;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const { since, limit, sleepMs } = parseArgs(args);

  const config = loadConfig();
  setLogLevel(config.log_level);

  const sink = resolveSink(config);
  if (sink === 'off') {
    process.stdout.write('backfill: sink is off; nothing to do\n');
    return;
  }

  const spoolDir = process.env.RD_SPOOL_DIR;
  if (sink === 'gateway' && !spoolDir) {
    process.stdout.write('backfill: gateway sink but RD_SPOOL_DIR unset\n');
    return;
  }
  if (sink === 'direct' && !config.private_key) {
    process.stdout.write('backfill: direct sink but no private_key configured\n');
    return;
  }

  let deriveHeaders: DeriveHeaders | undefined;
  let walletAddress = (process.env.RD_WALLET_ADDRESS || '').toLowerCase();
  const apiKey = config.api_key ?? '';
  if (sink === 'direct' && config.private_key) {
    walletAddress = addressFromPrivateKey(config.private_key).toLowerCase();
    try {
      deriveHeaders = await getDeriveHeaders({ apiUrl: config.api_url, apiKey, privateKey: config.private_key });
    } catch (err) {
      process.stdout.write(`backfill: derive failed (${(err as Error).message}); graph ops will be queued\n`);
    }
  }

  const state = readState();
  state.backfilled = state.backfilled ?? {};

  const candidates = selectBackfillCandidates(collectSessionFiles(), { since, limit, done: state.backfilled });

  process.stdout.write(`backfill: ${candidates.length} session(s) to replay (sink=${sink})\n`);

  let done = 0;
  for (const session of candidates) {
    const events = transcriptToEvents(session.file);
    if (events.length === 0) {
      state.backfilled[session.id] = true;
      continue;
    }
    const claudeSessionId = events[0].claudeSessionId || session.id;
    const summary = parseTranscriptSummary(session.file);

    try {
      if (sink === 'gateway') {
        writeGatewayUnit({ spoolDir: spoolDir as string, walletAddress, claudeSessionId, events, summary });
      } else {
        await writeDirectUnit({
          config,
          walletAddress,
          apiKey,
          deriveHeaders,
          claudeSessionId,
          events,
          summary,
          transcriptPath: session.file,
          legacyStreamMaxSequence: -1,
        });
      }
      done += 1;
    } catch (err) {
      log('warn', 'backfill session failed', { id: session.id, error: (err as Error).message });
    }

    state.backfilled[session.id] = true;
    state.backfillWatermark = new Date(session.mtimeMs).toISOString();
    writeState(state);
    process.stdout.write(`  replayed ${claudeSessionId} (${events.length} events)\n`);

    if (sleepMs > 0) await sleep(sleepMs);
  }

  process.stdout.write(`backfill: done, ${done} session(s) replayed\n`);
}

main()
  .catch((err) => {
    try { log('error', 'backfill failed', { error: (err as Error).message }); } catch { /* ignore */ }
    process.stdout.write(`backfill error: ${(err as Error).message}\n`);
  })
  .finally(() => process.exit(0));
