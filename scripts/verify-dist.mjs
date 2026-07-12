#!/usr/bin/env node
/**
 * verify-dist — rebuild the bundles into a temp dir and byte-compare against the
 * checked-in dist/. Exits 1 on any mismatch, missing file, or extra file. This
 * is the CI gate enforcing invariant "one commit = one behavior": a pinned
 * commit hash fully determines the executable bytes.
 */
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const distDir = path.join(root, 'dist');
const buildScript = path.join(here, 'build.mjs');

function listMjs(dir) {
  try {
    return fs.readdirSync(dir).filter((f) => f.endsWith('.mjs')).sort();
  } catch {
    return [];
  }
}

function main() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rd-plugin-verify-'));
  try {
    const result = spawnSync(process.execPath, [buildScript, tmpDir], { stdio: ['ignore', 'pipe', 'pipe'] });
    if (result.status !== 0) {
      process.stderr.write(`verify-dist: rebuild failed\n${result.stderr?.toString() ?? ''}\n`);
      process.exit(1);
    }

    const committed = listMjs(distDir);
    const rebuilt = listMjs(tmpDir);

    const mismatches = [];
    const allNames = new Set([...committed, ...rebuilt]);
    for (const name of [...allNames].sort()) {
      const inCommitted = committed.includes(name);
      const inRebuilt = rebuilt.includes(name);
      if (!inCommitted) {
        mismatches.push(`extra rebuilt file not checked in: ${name}`);
        continue;
      }
      if (!inRebuilt) {
        mismatches.push(`checked-in file not produced by build: ${name}`);
        continue;
      }
      const a = fs.readFileSync(path.join(distDir, name));
      const b = fs.readFileSync(path.join(tmpDir, name));
      if (!a.equals(b)) mismatches.push(`byte mismatch: ${name} (dist=${a.length}B rebuilt=${b.length}B)`);
    }

    if (mismatches.length > 0) {
      process.stderr.write('verify-dist: FAIL\n');
      for (const m of mismatches) process.stderr.write(`  - ${m}\n`);
      process.stderr.write('Run `npm run build` and commit dist/.\n');
      process.exit(1);
    }

    process.stdout.write(`verify-dist: OK (${committed.length} bundles byte-identical)\n`);
  } finally {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ }
  }
}

main();
