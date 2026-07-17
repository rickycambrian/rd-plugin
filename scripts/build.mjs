#!/usr/bin/env node
/**
 * Deterministic bundler: each src entrypoint -> a single-file ESM bundle in
 * dist/ with zero runtime deps (all imports, including the rickydata SDK and
 * @noble/* crypto, are inlined). Determinism is load-bearing: the checked-in
 * dist/ must be byte-reproducible from src/ (CI verify-dist), so we sort the
 * entry list, disable minification, and emit no timestamps or license banners.
 *
 * Optional first arg = output directory (default ./dist). verify-dist builds to
 * a temp dir and byte-compares against dist/.
 */
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const srcDir = path.join(root, 'src');
const outDir = path.resolve(process.argv[2] ?? path.join(root, 'dist'));

// Entrypoints that become dist/*.mjs. Sorted for deterministic build order.
const ENTRYPOINTS = [
  'backfill.ts',
  'capture.ts',
  'codex-capture.ts',
  'codex-flush.ts',
  'drain-queue.ts',
  'flush.ts',
  'monitor-advisory.ts',
  'session-start.ts',
  'task-context.ts',
  'setup-codex.ts',
  'setup.ts',
].sort();

async function main() {
  fs.mkdirSync(outDir, { recursive: true });

  for (const entry of ENTRYPOINTS) {
    const outfile = path.join(outDir, entry.replace(/\.ts$/, '.mjs'));
    await build({
      entryPoints: [path.join(srcDir, entry)],
      outfile,
      bundle: true,
      format: 'esm',
      platform: 'node',
      target: 'node18',
      minify: false,
      sourcemap: false,
      legalComments: 'none',
      logLevel: 'warning',
      // Keep node builtins external; everything else is inlined for zero deps.
      external: [],
      banner: { js: '// rd-plugin bundled output — do not edit; regenerate via `npm run build`.' },
    });
  }

  process.stdout.write(`build: ${ENTRYPOINTS.length} entrypoints -> ${outDir}\n`);
}

main().catch((err) => {
  process.stderr.write(`build failed: ${err.message}\n`);
  process.exit(1);
});
