/**
 * Pure config-merge logic for /rd-setup. Kept free of filesystem IO so it can be
 * unit-tested without touching the real ~/.rickydata/config.json. The entrypoint
 * (setup.ts) supplies the existing config and persists the result.
 */

export type ConfigRecord = Record<string, unknown>;

const STRING_KEYS = new Set(['api_url', 'api_key', 'private_key', 'sink', 'log_level']);
const BOOL_KEYS = new Set(['enabled', 'track_messages', 'track_files', 'track_git']);
const LIST_KEYS = new Set(['excluded_directories']);
const SECRET_KEYS = new Set(['api_key', 'private_key']);
const SINK_VALUES = new Set(['direct', 'gateway', 'off']);

export interface ParsedUpdate {
  updates: ConfigRecord;
  force: boolean;
  errors: string[];
}

/** Parse `key=value` argv tokens (+ `--force`) into a typed update object. */
export function parseSetupArgs(args: string[]): ParsedUpdate {
  const updates: ConfigRecord = {};
  const errors: string[] = [];
  let force = false;

  for (const arg of args) {
    if (arg === '--force') {
      force = true;
      continue;
    }
    const eq = arg.indexOf('=');
    if (eq <= 0) continue;
    const key = arg.slice(0, eq).replace(/^--/, '').trim();
    const raw = arg.slice(eq + 1);

    if (STRING_KEYS.has(key)) {
      if (key === 'sink' && !SINK_VALUES.has(raw)) {
        errors.push(`invalid sink "${raw}" (expected direct|gateway|off)`);
        continue;
      }
      updates[key] = raw;
    } else if (BOOL_KEYS.has(key)) {
      if (raw !== 'true' && raw !== 'false') {
        errors.push(`invalid boolean for ${key}: "${raw}"`);
        continue;
      }
      updates[key] = raw === 'true';
    } else if (LIST_KEYS.has(key)) {
      updates[key] = raw.split(',').map((s) => s.trim()).filter(Boolean);
    }
    // Unknown keys are ignored (never blow up a setup command).
  }

  return { updates, force, errors };
}

export interface SetupResult {
  config: ConfigRecord;
  applied: string[];
  skipped: string[];
  notices: string[];
}

/**
 * Merge `updates` into `existing`. Existing keys are NEVER silently overwritten:
 * a differing value is only replaced when `force` is set, otherwise it is
 * reported in `skipped`. Unknown existing keys are preserved untouched.
 */
export function applySetup(existing: ConfigRecord, updates: ConfigRecord, force: boolean): SetupResult {
  const config: ConfigRecord = { ...existing };
  const applied: string[] = [];
  const skipped: string[] = [];
  const notices: string[] = [];

  for (const [key, value] of Object.entries(updates)) {
    const has = Object.prototype.hasOwnProperty.call(existing, key);
    const changed = JSON.stringify(existing[key]) !== JSON.stringify(value);
    if (has && changed && !force) {
      skipped.push(key);
      notices.push(`kept existing ${key} (pass ${key}=... --force to overwrite)`);
      continue;
    }
    config[key] = value;
    if (!has || changed) applied.push(key);
  }

  return { config, applied, skipped, notices };
}

/** Redact secret values for display. */
export function maskConfig(config: ConfigRecord): ConfigRecord {
  const out: ConfigRecord = { ...config };
  for (const key of SECRET_KEYS) {
    if (typeof out[key] === 'string' && out[key]) out[key] = '***';
  }
  return out;
}
