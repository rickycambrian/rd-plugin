import fs from 'node:fs';
import { CONFIG_FILE } from '../lib/paths.js';

/** GitHub org(s) whose repositories Codex sessions are captured for. */
export const DEFAULT_CODEX_REPO_OWNERS = ['rickycambrian'];

/** Stable agent id for Codex sessions in the execution graph (SPEC-000 §WS-F). */
export const RD_CODEX_AGENT_ID = process.env.RD_CODEX_AGENT_ID || 'codex';

/**
 * Read the optional `codex_repo_owners` override from ~/.rickydata/config.json.
 * Codex capture is gated to owned repositories (a git origin under one of these
 * GitHub owners); this keeps unrelated local work off the graph. The default
 * mirrors the legacy ~/.codex hook (`rickycambrian`). Owner comparison is
 * case-insensitive, so the returned list is lowercased.
 */
export function loadCodexRepoOwners(): string[] {
  let owners = DEFAULT_CODEX_REPO_OWNERS;
  try {
    const raw = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8')) as Record<string, unknown>;
    if (Array.isArray(raw.codex_repo_owners)) {
      const configured = raw.codex_repo_owners.filter((v): v is string => typeof v === 'string' && v.trim() !== '');
      if (configured.length > 0) owners = configured;
    }
  } catch {
    // no config / unreadable → default owners
  }
  return owners.map((o) => o.toLowerCase());
}
