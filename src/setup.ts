import fs from 'node:fs';
import { CONFIG_FILE, STATE_DIR, PENDING_DIR, QUEUE_DIR, DATA_DIR } from './lib/paths.js';
import { readJsonFile, writeJsonFileAtomic } from './lib/fsutil.js';
import { setLogLevel, log } from './lib/log.js';
import {
  parseSetupArgs,
  applySetup,
  applyWalletVerification,
  maskConfig,
  type ConfigRecord,
  type WalletVerification,
} from './lib/setup-core.js';
import { wantsHelp } from './lib/cli-help.js';
import { getDeriveHeaders } from './lib/derive.js';
import { DEFAULT_API_URL } from './lib/config.js';

const USAGE = `usage: node setup.mjs [--status] [key=value ...] [--force] [--skip-verify]

Validate and merge rd-plugin config at ~/.rickydata/config.json. With no
key=value pairs it prints the current (masked) config and directory status.

  --status        print config + directory status only
  key=value       set a config key (existing keys need --force to overwrite)
  --force         allow overwriting existing keys
  --skip-verify   skip the sign-to-derive round-trip when persisting a new
                  private_key (for offline setups)
  -h, --help      show this help and exit
`;

/**
 * When a run persists a new `private_key`, perform one sign-to-derive
 * round-trip (derive-challenge -> EIP-712 sign -> derive-key) against the
 * configured KFDB to confirm the key is actually usable before we call setup
 * a success (SPEC-004 §2). Network errors are caught here, never thrown.
 */
async function verifyWallet(config: ConfigRecord, privateKey: string): Promise<WalletVerification> {
  const apiUrl = typeof config.api_url === 'string' && config.api_url ? config.api_url : DEFAULT_API_URL;
  const apiKey = typeof config.api_key === 'string' ? config.api_key : undefined;
  try {
    const headers = await getDeriveHeaders({ apiUrl, apiKey, privateKey });
    return { ok: true, address: headers['X-Wallet-Address'] };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

/**
 * setup — backend for /rd-setup. Validates + merges config, creating the
 * ~/.rickydata directory tree. Existing config keys are never overwritten
 * without an explicit `--force`. Usage:
 *   node setup.mjs [--status] [key=value ...] [--force] [--skip-verify]
 * With no updates it just prints the (masked) current config + directory status.
 * Persisting a new `private_key` triggers one S2D verification round-trip; on
 * failure the key is removed rather than left in a broken state.
 */
async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (wantsHelp(args)) {
    process.stdout.write(USAGE);
    return;
  }
  const skipVerify = args.includes('--skip-verify');
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
  let finalConfig = result.config;

  const persistedPrivateKey = result.applied.includes('private_key') && typeof finalConfig.private_key === 'string'
    ? (finalConfig.private_key as string)
    : undefined;

  if (persistedPrivateKey && skipVerify) {
    process.stdout.write('note: wallet enrollment verification skipped (--skip-verify)\n');
  } else if (persistedPrivateKey) {
    const verification = await verifyWallet(finalConfig, persistedPrivateKey);
    const verified = applyWalletVerification(finalConfig, verification);
    finalConfig = verified.config;
    process.stdout.write(`${verified.message}\n`);
  }

  if (result.applied.length > 0) {
    writeJsonFileAtomic(CONFIG_FILE, finalConfig);
    log('info', 'setup applied', { applied: result.applied, skipped: result.skipped });
  }

  for (const notice of result.notices) process.stdout.write(`note: ${notice}\n`);
  process.stdout.write(`applied: ${result.applied.join(', ') || '(none)'}\n`);
  printStatus(finalConfig);
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
