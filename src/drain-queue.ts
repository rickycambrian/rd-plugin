import { loadConfig, resolveSink } from './lib/config.js';
import { setLogLevel, log } from './lib/log.js';
import { getDeriveHeaders, type DeriveHeaders } from './lib/derive.js';
import { drainQueue, queueSize, reviveTransientDeadLetters } from './lib/queue.js';
import { kfdbAuthFromConfig } from './lib/kfdb-auth.js';
import { wantsHelp } from './lib/cli-help.js';

const USAGE = `usage: node drain-queue.mjs [--batch=<n>] [--budget-min=<n>] [--revive-transient] [--auto]

Replay the offline retry queue (re-derives S2D auth at send time).

  --batch=<n>       max queued entries to send this run (default 500)
  --budget-min=<n>  wall-clock budget in minutes (default 30)
  --revive-transient restore dead letters now classified as transient
  --auto            suppress the JSON result line (cron/opportunistic use)
  -h, --help        show this help and exit
`;

/**
 * drain-queue — replay the offline retry queue. Invoked standalone (`/rd-status`
 * repair, cron) or opportunistically from flush. Re-derives S2D auth at send
 * time; secrets never live on disk. Fail-open: exit 0.
 */
async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (wantsHelp(args)) {
    process.stdout.write(USAGE);
    return;
  }
  const batchArg = args.find((a) => a.startsWith('--batch='));
  const limit = batchArg ? Math.max(1, parseInt(batchArg.split('=')[1], 10) || 500) : 500;
  const budgetArg = args.find((a) => a.startsWith('--budget-min='));
  const budgetMin = budgetArg ? Math.max(1, parseInt(budgetArg.split('=')[1], 10) || 30) : 30;

  const config = loadConfig();
  setLogLevel(config.log_level);

  const revival = args.includes('--revive-transient')
    ? reviveTransientDeadLetters()
    : { revived: 0, retained: 0, invalid: 0 };
  const pending = queueSize();
  if (pending === 0) {
    log('debug', 'drain: queue empty');
    if (args.includes('--revive-transient') && !args.includes('--auto')) {
      process.stdout.write(`${JSON.stringify({ ...revival, remaining: 0 })}\n`);
    }
    return;
  }

  const sink = resolveSink(config);
  if (sink !== 'direct' || !config.private_key) {
    log('info', 'drain: nothing to do (non-direct sink or no key)', { pending, sink });
    return;
  }

  let deriveHeaders: DeriveHeaders;
  try {
    deriveHeaders = await getDeriveHeaders({ apiUrl: config.api_url, apiKey: config.api_key, privateKey: config.private_key });
  } catch (err) {
    log('warn', 'drain: derive failed; leaving queue intact', { error: (err as Error).message });
    return;
  }

  const result = await drainQueue(kfdbAuthFromConfig(config, deriveHeaders), limit, { maxMs: budgetMin * 60_000 });
  const report = {
    ...result,
    revivedDeadLetters: revival.revived,
    retainedDeadLetters: revival.retained,
    invalidDeadLetters: revival.invalid,
  };
  log('info', 'drain complete', report as unknown as Record<string, unknown>);
  if (!args.includes('--auto')) {
    process.stdout.write(`${JSON.stringify(report)}\n`);
  }
}

main()
  .catch((err) => {
    try { log('error', 'drain failed', { error: (err as Error).message }); } catch { /* ignore */ }
  })
  .finally(() => process.exit(0));
