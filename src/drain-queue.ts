import { loadConfig, resolveSink } from './lib/config.js';
import { setLogLevel, log } from './lib/log.js';
import { getDeriveHeaders, type DeriveHeaders } from './lib/derive.js';
import { drainQueue, queueSize } from './lib/queue.js';

/**
 * drain-queue — replay the offline retry queue. Invoked standalone (`/rd-status`
 * repair, cron) or opportunistically from flush. Re-derives S2D auth at send
 * time; secrets never live on disk. Fail-open: exit 0.
 */
async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const batchArg = args.find((a) => a.startsWith('--batch='));
  const limit = batchArg ? Math.max(1, parseInt(batchArg.split('=')[1], 10) || 500) : 500;

  const config = loadConfig();
  setLogLevel(config.log_level);

  const pending = queueSize();
  if (pending === 0) {
    log('debug', 'drain: queue empty');
    return;
  }

  const sink = resolveSink(config);
  if (sink !== 'direct' || !config.private_key) {
    log('info', 'drain: nothing to do (non-direct sink or no key)', { pending, sink });
    return;
  }

  const apiKey = config.api_key ?? '';
  let deriveHeaders: DeriveHeaders;
  try {
    deriveHeaders = await getDeriveHeaders({ apiUrl: config.api_url, apiKey, privateKey: config.private_key });
  } catch (err) {
    log('warn', 'drain: derive failed; leaving queue intact', { error: (err as Error).message });
    return;
  }

  const result = await drainQueue({ apiKey, deriveHeaders }, limit);
  log('info', 'drain complete', result as unknown as Record<string, unknown>);
  if (!args.includes('--auto')) {
    process.stdout.write(`${JSON.stringify(result)}\n`);
  }
}

main()
  .catch((err) => {
    try { log('error', 'drain failed', { error: (err as Error).message }); } catch { /* ignore */ }
  })
  .finally(() => process.exit(0));
