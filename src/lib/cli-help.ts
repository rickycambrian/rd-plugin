/**
 * Shared `--help` / `-h` detection for the CLI-style dist entrypoints. Kept
 * trivial so every argv-parsing entrypoint can guard against an accidental real
 * run — notably `backfill.mjs --help`, which otherwise falls through to a live
 * replay at the default limit.
 */
export function wantsHelp(args: string[]): boolean {
  return args.includes('--help') || args.includes('-h');
}
