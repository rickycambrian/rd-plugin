import fs from 'node:fs';
import { CONFIG_FILE } from '../lib/paths.js';

/**
 * Legacy default owner gate. Retained only for installs that set
 * `codex_repo_owners` explicitly; when the key is absent the gate is OFF so
 * external users' repos are captured out of the box (matching the Claude Code
 * path, which has no owner gate).
 */
export const DEFAULT_CODEX_REPO_OWNERS = ['rickycambrian'];

/** Stable agent id for Codex sessions in the execution graph (SPEC-000 §WS-F). */
export const RD_CODEX_AGENT_ID = process.env.RD_CODEX_AGENT_ID || 'codex';

/**
 * Read the optional `codex_repo_owners` allowlist from ~/.rickydata/config.json.
 * When the key is absent (or contains `"*"`), the owner gate is OFF and any
 * GitHub-remoted repository is captured — external users get capture out of
 * the box, mirroring the Claude Code path. When set to a non-empty list of
 * GitHub owners, Codex capture is restricted to repos under those owners
 * (case-insensitive; the returned list is lowercased). Returns null when the
 * gate is off.
 */
export function loadCodexRepoOwners(): string[] | null {
  try {
    const raw = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8')) as Record<string, unknown>;
    if (Array.isArray(raw.codex_repo_owners)) {
      const configured = raw.codex_repo_owners.filter((v): v is string => typeof v === 'string' && v.trim() !== '');
      if (configured.some((o) => o.trim() === '*')) return null;
      if (configured.length > 0) return configured.map((o) => o.toLowerCase());
    }
  } catch {
    // no config / unreadable → gate off
  }
  return null;
}
