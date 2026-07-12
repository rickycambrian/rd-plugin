import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { wantsHelp } from './lib/cli-help.js';
import { log } from './lib/log.js';
import { analyzeWiring, applyWiring, buildFreshWiringBlock } from './codex/toml-wiring.js';

const USAGE = `usage: node setup-codex.mjs [--apply]

Wire Codex (~/.codex/config.toml) hook events to rd-plugin's codex-capture.mjs
so Codex sessions land in the same wallet-scoped knowledge graph as Claude
Code sessions. Default run is a DRY RUN that only prints what would change.

  --apply       perform the edit (writes a timestamped backup first)
  -h, --help    show this help and exit
`;

const TRUST_CAVEAT = [
  '',
  'Trust note: Codex pins a "trusted_hash" per hook command under [hooks.state]',
  'in config.toml. After wiring, interactive `codex` prompts once to trust the',
  'new command -- accept it, or the hooks stay inert. `codex exec` (non-interactive)',
  'silently skips untrusted hooks unless run with --dangerously-bypass-hook-trust.',
  '',
].join('\n');

function resolveConfigPath(): string {
  const codexHome = process.env.CODEX_HOME && process.env.CODEX_HOME.trim() ? process.env.CODEX_HOME : path.join(os.homedir(), '.codex');
  return path.join(codexHome, 'config.toml');
}

/** Resolve the sibling `codex-capture.mjs` from this script's own dist location, so it works from any install path (plugin cache dir, git clone, etc). */
function resolveCaptureCommand(): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  return `node ${path.join(here, 'codex-capture.mjs')}`;
}

function timestampSuffix(): string {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (wantsHelp(args)) {
    process.stdout.write(USAGE);
    return;
  }
  const apply = args.includes('--apply');

  const configPath = resolveConfigPath();
  const command = resolveCaptureCommand();

  if (!fs.existsSync(configPath)) {
    process.stdout.write(`no Codex config found at ${configPath}\n\n`);
    process.stdout.write('Create it (Codex reads this on startup) and add at least:\n\n');
    process.stdout.write('[features]\nplugin_hooks = true\ncodex_hooks = true\n\n');
    process.stdout.write(`${buildFreshWiringBlock(command)}\n`);
    process.stdout.write(TRUST_CAVEAT);
    return;
  }

  const content = fs.readFileSync(configPath, 'utf8');
  const status = analyzeWiring(content);

  if (status.fullyWired) {
    process.stdout.write(`already wired: ${configPath}\n`);
    process.stdout.write(`  events:  ${status.wiredEvents.join(', ')}\n`);
    process.stdout.write(`  command: ${command}\n`);
    process.stdout.write(TRUST_CAVEAT);
    return;
  }

  const plan = applyWiring(content, command);

  if (!apply) {
    process.stdout.write(`DRY RUN -- ${configPath}\n`);
    if (status.wiredEvents.length > 0) process.stdout.write(`  already wired:        ${status.wiredEvents.join(', ')}\n`);
    if (status.legacyEvents.length > 0) process.stdout.write(`  would repoint legacy: ${status.legacyEvents.join(', ')} (kfdb-codex-hook.mjs -> codex-capture.mjs)\n`);
    if (status.missingEvents.length > 0) process.stdout.write(`  would append fresh:   ${status.missingEvents.join(', ')}\n`);
    process.stdout.write(`\nNew hook command: ${command}\n`);
    process.stdout.write('\nRun again with --apply to write the change (a timestamped backup is made first).\n');
    process.stdout.write(TRUST_CAVEAT);
    return;
  }

  const backupPath = `${configPath}.bak-rd-plugin-${timestampSuffix()}`;
  fs.copyFileSync(configPath, backupPath);
  fs.writeFileSync(configPath, plan.content, 'utf8');

  process.stdout.write(`applied: ${configPath}\n`);
  process.stdout.write(`backup:  ${backupPath}\n`);
  if (status.legacyEvents.length > 0) {
    process.stdout.write(`  repointed: ${status.legacyEvents.join(', ')} (${plan.repointedCount} command line(s))\n`);
  }
  if (plan.appendedEvents.length > 0) {
    process.stdout.write(`  appended:  ${plan.appendedEvents.join(', ')}\n`);
  }
  process.stdout.write(TRUST_CAVEAT);
  log('info', 'codex wiring applied', {
    configPath,
    repointedEvents: status.legacyEvents,
    appendedEvents: plan.appendedEvents,
  });
}

main()
  .catch((err) => {
    try { log('error', 'setup-codex failed', { error: (err as Error).message }); } catch { /* ignore */ }
    process.stdout.write(`setup-codex error: ${(err as Error).message}\n`);
  })
  .finally(() => process.exit(0));
