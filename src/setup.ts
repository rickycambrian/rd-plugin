import fs from 'node:fs';
import { CONFIG_FILE, STATE_DIR, PENDING_DIR, QUEUE_DIR, DATA_DIR } from './lib/paths.js';
import { readJsonFile, writeJsonFileAtomic } from './lib/fsutil.js';
import { setLogLevel, log } from './lib/log.js';
import { parseSetupArgs, applySetup, maskConfig, type ConfigRecord } from './lib/setup-core.js';
import { wantsHelp } from './lib/cli-help.js';

const USAGE = `usage: node setup.mjs [--status] [key=value ...] [--force]

Validate and merge rd-plugin config at ~/.rickydata/config.json. With no
key=value pairs it prints the current (masked) config and directory status.

  --status      print config + directory status only
  key=value     set a config key (existing keys need --force to overwrite)
  --force       allow overwriting existing keys
  -h, --help    show this help and exit
`;

/**
 * setup — backend for /rd-setup. Validates + merges config, creating the
 * ~/.rickydata directory tree. Existing config keys are never overwritten
 * without an explicit `--force`. Usage:
 *   node setup.mjs [--status] [key=value ...] [--force]
 * With no updates it just prints the (masked) current config + directory status.
 */
async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (wantsHelp(args)) {
    process.stdout.write(USAGE);
    return;
  }
  const statusOnly = args.includes('--status') || args.filter((a) => a.includes('=')).length === 0;

  const existing = readJsonFile<ConfigRecord>(CONFIG_FILE, {});
  setLogLevel(typeof existing.log_level === 'string' ? existing.log_level : 'info');

  ensureDirs();

  if (statusOnly) {
    printStatus(existing);
    return;
  }

  const { updates, force, errors } = parseSetupArgs(args);
  for (const err of errors) process.stdout.write(`error: ${err}\n`);

  const result = applySetup(existing, updates, force);
  if (result.applied.length > 0) {
    writeJsonFileAtomic(CONFIG_FILE, result.config);
    log('info', 'setup applied', { applied: result.applied, skipped: result.skipped });
  }

  for (const notice of result.notices) process.stdout.write(`note: ${notice}\n`);
  process.stdout.write(`applied: ${result.applied.join(', ') || '(none)'}\n`);
  printStatus(result.config);
}

function ensureDirs(): void {
  for (const dir of [DATA_DIR, STATE_DIR, PENDING_DIR, QUEUE_DIR]) {
    try { fs.mkdirSync(dir, { recursive: true }); } catch { /* best-effort */ }
  }
}

function printStatus(config: ConfigRecord): void {
  const masked = maskConfig(config);
  process.stdout.write(`config: ${CONFIG_FILE}\n`);
  process.stdout.write(`${JSON.stringify(masked, null, 2)}\n`);
}

main()
  .catch((err) => {
    try { log('error', 'setup failed', { error: (err as Error).message }); } catch { /* ignore */ }
    process.stdout.write(`setup error: ${(err as Error).message}\n`);
  })
  .finally(() => process.exit(0));
