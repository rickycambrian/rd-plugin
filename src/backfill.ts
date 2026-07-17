import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadConfig, resolveSink } from './lib/config.js';
import { setLogLevel, log } from './lib/log.js';
import { readState, updateStateLocked } from './lib/state.js';
import { parseTranscriptSummary, transcriptToEvents } from './lib/transcript.js';
import { getDeriveHeaders, addressFromPrivateKey, type DeriveHeaders } from './lib/derive.js';
import { kfdbAuthFromConfig } from './lib/kfdb-auth.js';
import { writeDirectUnit, writeGatewayUnit } from './lib/writer.js';
import { selectBackfillCandidates, type DiscoveredSession } from './lib/backfill-core.js';
import { wantsHelp } from './lib/cli-help.js';
import { claudeCodeSessionNodeId, type ClaudeCodeHookTrace } from 'rickydata/kfdb';
import { RD_AGENT_ID } from './lib/trace.js';
import { writeGraph } from './lib/graph.js';
import { buildPlanOperations, buildSessionStubOperation } from './lib/plan.js';
import { collectEmbedTargets, embedTargets, type EmbedTarget } from './lib/embed.js';
import type { KfdbAuth } from './lib/kfdb-auth.js';

const USAGE = `usage: node backfill.mjs [--since <ISO-date>] [--limit <n>] [--sleep <ms>] [--plans]

Replay historical Claude Code transcripts through the flush write path so past
sessions land in the graph. Resumable via a per-session watermark in state.json.

  --since <ISO-date>  only replay sessions modified on/after this date
  --limit <n>         max sessions to replay (default 100)
  --sleep <ms>        delay between sessions (default 1000)
  --plans             plans-only pass: scan ALL transcripts (ignores the
                      backfill watermark) for plan-mode plans, upsert Plan
                      nodes + HAS_PLAN edges, then sweep ~/.claude/plans/*.md
                      for current on-disk bodies (direct sink only)
  -h, --help          show this help and exit
`;

/**
 * backfill — replay historical Claude Code transcripts (~/.claude/projects/​**​/*.jsonl)
 * through the same flush write path so past sessions land in the graph. Resumable
 * via a per-session watermark in state.json; gentle inter-session sleep to respect
 * the per-wallet rate limiter. Usage:
 *   node backfill.mjs [--since <ISO-date>] [--limit <n>] [--sleep <ms>]
 * Fail-open: exit 0.
 */
type SessionFile = DiscoveredSession;

function parseArgs(args: string[]): { since?: number; limit: number; sleepMs: number; plans: boolean } {
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
    plans: args.includes('--plans'),
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

/** Raw markers that make a transcript worth parsing in the plans-only pass. */
const PLAN_MARKERS = ['"plan_mode"', '"ExitPlanMode"', '.claude/plans/'];

/** Keep plan bodies safely under KFDB's 1 MB per-property limit. */
const MAX_PLAN_CONTENT_BYTES = 1_000_000;

/**
 * Plans-only pass (SPEC: plan ingestion). Ignores the backfill watermark on
 * purpose: it retrofits Plan nodes onto sessions that were already replayed
 * before plan extraction existed. Cheap raw-marker scan first, full parse only
 * on hits. Then sweeps ~/.claude/plans/*.md so every Plan node carries the
 * current on-disk body (later edits from other sessions included).
 */
async function runPlansPass(opts: { apiUrl: string; auth: KfdbAuth; walletAddress: string; sleepMs: number }): Promise<void> {
  const { apiUrl, auth, walletAddress, sleepMs } = opts;
  let sessionsWithPlans = 0;
  // Accumulate embed targets across the whole pass; last write wins per node,
  // so the disk sweep's fresher plan body replaces the transcript-derived one.
  const embedMap = new Map<string, EmbedTarget>();

  for (const session of collectSessionFiles()) {
    let raw: string;
    try {
      raw = fs.readFileSync(session.file, 'utf8');
    } catch {
      continue;
    }
    if (!PLAN_MARKERS.some((m) => raw.includes(m))) continue;
    const summary = parseTranscriptSummary(session.file);
    if (!summary.plans?.length) continue;
    const claudeSessionId = summary.claudeSessionId ?? session.id;
    const sessionNodeId = claudeCodeSessionNodeId({
      walletAddress,
      agentId: RD_AGENT_ID,
      sessionId: claudeSessionId,
      claudeSessionId,
    } as ClaudeCodeHookTrace);
    const operations = [
      buildSessionStubOperation(sessionNodeId, walletAddress, RD_AGENT_ID, claudeSessionId),
      ...buildPlanOperations(summary.plans, sessionNodeId),
    ];
    try {
      await writeGraph(apiUrl, auth, operations);
      for (const t of collectEmbedTargets(operations)) embedMap.set(`${t.label}:${t.node_id}`, t);
      sessionsWithPlans += 1;
      process.stdout.write(`  plans: ${claudeSessionId} — ${summary.plans.length} plan(s), ${operations.length} ops\n`);
    } catch (err) {
      log('warn', 'plans pass session failed', { id: claudeSessionId, error: (err as Error).message });
    }
    if (sleepMs > 0) await sleep(sleepMs);
  }

  let swept = 0;
  const plansDir = path.join(os.homedir(), '.claude', 'plans');
  let dirents: fs.Dirent[] = [];
  try {
    dirents = fs.readdirSync(plansDir, { withFileTypes: true });
  } catch {
    // no plans dir — nothing to sweep
  }
  for (const dirent of dirents) {
    if (!dirent.isFile() || !dirent.name.endsWith('.md')) continue;
    const planFilePath = path.join(plansDir, dirent.name);
    try {
      const stat = fs.statSync(planFilePath);
      if (stat.size === 0 || stat.size > MAX_PLAN_CONTENT_BYTES) continue;
      const content = fs.readFileSync(planFilePath, 'utf8');
      const operations = buildPlanOperations([{ planFilePath, content, updatedAt: Math.round(stat.mtimeMs) }]);
      await writeGraph(apiUrl, auth, operations);
      for (const t of collectEmbedTargets(operations)) embedMap.set(`${t.label}:${t.node_id}`, t);
      swept += 1;
    } catch (err) {
      log('warn', 'plans sweep file failed', { file: dirent.name, error: (err as Error).message });
    }
    if (sleepMs > 0) await sleep(sleepMs);
  }

  const embedded = await embedTargets(apiUrl, auth, [...embedMap.values()]);
  process.stdout.write(`backfill --plans: done, ${sessionsWithPlans} session(s) linked, ${swept} plan file(s) swept, ${embedded} node(s) embedded\n`);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (wantsHelp(args)) {
    process.stdout.write(USAGE);
    return;
  }
  const { since, limit, sleepMs, plans } = parseArgs(args);

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
  if (sink === 'direct' && config.private_key) {
    walletAddress = addressFromPrivateKey(config.private_key).toLowerCase();
    try {
      deriveHeaders = await getDeriveHeaders({ apiUrl: config.api_url, apiKey: config.api_key, privateKey: config.private_key });
    } catch (err) {
      process.stdout.write(`backfill: derive failed (${(err as Error).message}); graph ops will be queued\n`);
    }
  }
  const auth = kfdbAuthFromConfig(config, deriveHeaders);

  if (plans) {
    if (sink !== 'direct') {
      process.stdout.write('backfill: --plans requires the direct sink\n');
      return;
    }
    await runPlansPass({ apiUrl: config.api_url, auth, walletAddress, sleepMs });
    return;
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
          auth,
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
    // Locked read-merge-write so concurrent session flushes don't lose entries
    // (and vice versa) — see updateStateLocked.
    await updateStateLocked((current) => {
      current.backfilled = { ...(current.backfilled ?? {}), ...state.backfilled };
      current.backfillWatermark = state.backfillWatermark;
    });
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
