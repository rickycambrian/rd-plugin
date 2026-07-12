#!/usr/bin/env node
/**
 * migrate-settings.mjs — remove the legacy KFDB inline-hook wiring from
 * ~/.claude/settings.json now that rd-plugin owns session capture.
 *
 * Dry-run by default: prints a unified diff and exits without writing.
 * Pass --apply to write the change (a timestamped backup is created first).
 *
 * What it removes (matched by CONTENT, not line numbers):
 *   1. Inline hook command entries whose command references the legacy KFDB
 *      plugin scripts (KFDB_PLUGIN_ROOT or a knowledgeflow_plugin_kfdb path).
 *   2. The env var KFDB_PLUGIN_ROOT.
 *   3. enabledPlugins["knowledgeflow@cambriannetwork"].
 *   4. extraKnownMarketplaces entry for the cambriannetwork/knowledgeflow_plugin_kfdb marketplace.
 *
 * What it PRESERVES: every other hook (including the ~/.nyx/hook-bridge.cjs
 * hooks), the rd-plugin@rickydata enabledPlugins entry, and the rickydata
 * marketplace entry.
 *
 * Usage:
 *   node scripts/migrate-settings.mjs                 # dry-run, prints diff
 *   node scripts/migrate-settings.mjs --apply         # write + backup
 *   node scripts/migrate-settings.mjs --file <path>   # target a different settings.json
 */

import { readFileSync, writeFileSync, copyFileSync, existsSync, mkdtempSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const fileFlagIdx = args.indexOf('--file');
const SETTINGS_PATH = fileFlagIdx !== -1 && args[fileFlagIdx + 1]
  ? args[fileFlagIdx + 1]
  : join(homedir(), '.claude', 'settings.json');

/** A command string belongs to the legacy KFDB plugin if it references either marker. */
function isLegacyKfdbCommand(command) {
  if (typeof command !== 'string') return false;
  return command.includes('KFDB_PLUGIN_ROOT') || command.includes('knowledgeflow_plugin_kfdb');
}

/** Remove legacy KFDB command hooks from a Claude Code hooks object, dropping now-empty groups/events. */
function stripLegacyHooks(hooks) {
  if (!hooks || typeof hooks !== 'object') return { hooks, removed: 0 };
  let removed = 0;
  const out = {};
  for (const [eventName, groups] of Object.entries(hooks)) {
    if (!Array.isArray(groups)) { out[eventName] = groups; continue; }
    const keptGroups = [];
    for (const group of groups) {
      if (!group || !Array.isArray(group.hooks)) { keptGroups.push(group); continue; }
      const keptHooks = group.hooks.filter((h) => {
        const drop = isLegacyKfdbCommand(h && h.command);
        if (drop) removed += 1;
        return !drop;
      });
      // Drop a group only if it had command hooks and all of them were removed.
      if (keptHooks.length === 0 && group.hooks.length > 0) continue;
      keptGroups.push({ ...group, hooks: keptHooks });
    }
    // Drop an event entirely if every group under it was removed.
    if (keptGroups.length > 0) out[eventName] = keptGroups;
  }
  return { hooks: out, removed };
}

/** True if a marketplace entry points at the legacy knowledgeflow_plugin_kfdb source. */
function isLegacyMarketplace(name, entry) {
  if (name === 'cambriannetwork') return true;
  const path = entry && entry.source && entry.source.path;
  return typeof path === 'string' && path.includes('knowledgeflow_plugin_kfdb');
}

function migrate(settings) {
  const notes = [];
  const next = structuredClone(settings);

  // 1. Inline KFDB hooks
  const { hooks, removed } = stripLegacyHooks(next.hooks);
  next.hooks = hooks;
  if (removed > 0) notes.push(`removed ${removed} legacy KFDB inline hook command(s)`);

  // 2. env.KFDB_PLUGIN_ROOT
  if (next.env && Object.prototype.hasOwnProperty.call(next.env, 'KFDB_PLUGIN_ROOT')) {
    delete next.env.KFDB_PLUGIN_ROOT;
    notes.push('removed env.KFDB_PLUGIN_ROOT');
  }

  // 3. enabledPlugins["knowledgeflow@cambriannetwork"]
  if (next.enabledPlugins) {
    for (const key of Object.keys(next.enabledPlugins)) {
      if (key.includes('@cambriannetwork') || key.startsWith('knowledgeflow@')) {
        delete next.enabledPlugins[key];
        notes.push(`removed enabledPlugins["${key}"]`);
      }
    }
  }

  // 4. extraKnownMarketplaces cambriannetwork / knowledgeflow_plugin_kfdb
  if (next.extraKnownMarketplaces) {
    for (const [name, entry] of Object.entries(next.extraKnownMarketplaces)) {
      if (isLegacyMarketplace(name, entry)) {
        delete next.extraKnownMarketplaces[name];
        notes.push(`removed extraKnownMarketplaces["${name}"]`);
      }
    }
  }

  return { next, notes };
}

/** Unified diff via system `diff -u`; falls back to a plain before/after dump. */
function unifiedDiff(beforeText, afterText, label) {
  const dir = mkdtempSync(join(tmpdir(), 'rd-migrate-'));
  const a = join(dir, 'settings.before.json');
  const b = join(dir, 'settings.after.json');
  writeFileSync(a, beforeText);
  writeFileSync(b, afterText);
  const res = spawnSync('diff', ['-u', '--label', `a/${label}`, '--label', `b/${label}`, a, b], { encoding: 'utf8' });
  if (res.error) {
    return `# (system 'diff' unavailable — showing new file)\n${afterText}`;
  }
  return res.stdout || '(no differences)';
}

function main() {
  if (!existsSync(SETTINGS_PATH)) {
    console.error(`settings file not found: ${SETTINGS_PATH}`);
    process.exit(1);
  }

  const beforeText = readFileSync(SETTINGS_PATH, 'utf8');
  let settings;
  try {
    settings = JSON.parse(beforeText);
  } catch (err) {
    console.error(`settings file is not valid JSON: ${err.message}`);
    process.exit(1);
  }

  const { next, notes } = migrate(settings);
  const afterText = JSON.stringify(next, null, 2) + '\n';

  if (notes.length === 0 || beforeText === afterText) {
    console.log(`No legacy KFDB wiring found in ${SETTINGS_PATH} — nothing to do (idempotent).`);
    process.exit(0);
  }

  console.log(`Target: ${SETTINGS_PATH}`);
  console.log('Planned changes:');
  for (const n of notes) console.log(`  - ${n}`);
  console.log('');
  console.log(unifiedDiff(beforeText, afterText, 'settings.json'));
  console.log('');

  if (!APPLY) {
    console.log('Dry-run only. Re-run with --apply to write these changes (a timestamped backup will be created first).');
    process.exit(0);
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backup = `${SETTINGS_PATH}.bak.${stamp}`;
  copyFileSync(SETTINGS_PATH, backup);
  writeFileSync(SETTINGS_PATH, afterText);
  console.log(`Backup written: ${backup}`);
  console.log(`Applied changes to: ${SETTINGS_PATH}`);
}

main();
