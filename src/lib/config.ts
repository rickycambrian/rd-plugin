import fs from 'node:fs';
import { CONFIG_FILE } from './paths.js';

export const DEFAULT_API_URL = 'http://34.60.37.158';

export type Sink = 'direct' | 'gateway' | 'off';

export interface RdConfig {
  api_url: string;
  api_key?: string;
  private_key?: string;
  enabled: boolean;
  excluded_directories: string[];
  sink?: Sink;
  track_messages: boolean;
  track_files: boolean;
  track_git: boolean;
  log_level: string;
}

interface RawConfig {
  [key: string]: unknown;
}

function readRawConfig(): RawConfig {
  try {
    const parsed = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
    return parsed && typeof parsed === 'object' ? (parsed as RawConfig) : {};
  } catch {
    return {};
  }
}

function asBool(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
}

/**
 * Load the effective rd-plugin config, applying rd-plugin defaults for the new
 * optional keys (SPEC-000 §Config). RICKYDATA_API_URL overrides api_url.
 */
export function loadConfig(): RdConfig {
  const raw = readRawConfig();
  const private_key = typeof raw.private_key === 'string' ? raw.private_key : undefined;
  const api_url =
    process.env.RICKYDATA_API_URL ||
    (typeof raw.api_url === 'string' && raw.api_url) ||
    DEFAULT_API_URL;

  return {
    api_url,
    api_key: typeof raw.api_key === 'string' ? raw.api_key : undefined,
    private_key,
    // `enabled` is the user kill-switch and defaults on. The "do nothing when
    // there is no usable config" behavior is provided by resolveSink() returning
    // 'off' (which the hooks check first) — NOT by this flag. Defaulting to
    // Boolean(private_key) here would wrongly disable gateway-sink mode, where
    // there is no local private_key but tracking must still run.
    enabled: asBool(raw.enabled, true),
    excluded_directories: asStringArray(raw.excluded_directories),
    sink: raw.sink === 'direct' || raw.sink === 'gateway' || raw.sink === 'off' ? raw.sink : undefined,
    track_messages: asBool(raw.track_messages, true),
    track_files: asBool(raw.track_files, true),
    track_git: asBool(raw.track_git, true),
    log_level: typeof raw.log_level === 'string' ? raw.log_level : 'info',
  };
}

/**
 * Resolve the active sink (SPEC-000 §Sink resolution order):
 *   env RICKYDATA_KG_SINK  >  config.sink  >  auto
 *
 * auto = `direct` when the config carries a private_key, else `off` — UNLESS
 * RICKYDATA_KG_SINK=gateway is set, which needs no local config at all (the
 * gateway is the authenticator). The env branch is handled first, so a gateway
 * runner with an empty ~/.rickydata is a fully-configured state.
 */
export function resolveSink(config: RdConfig, env: NodeJS.ProcessEnv = process.env): Sink {
  const fromEnv = env.RICKYDATA_KG_SINK;
  if (fromEnv === 'direct' || fromEnv === 'gateway' || fromEnv === 'off') {
    return fromEnv;
  }
  if (config.sink) {
    return config.sink;
  }
  return config.private_key ? 'direct' : 'off';
}

/** True when hooks should track the given cwd (kill switch + excluded dirs). */
export function shouldTrack(config: RdConfig, cwd: string | undefined): boolean {
  if (config.enabled === false) return false;
  if (cwd && config.excluded_directories.length > 0) {
    const normalizedCwd = cwd.replace(/\\/g, '/').toLowerCase();
    for (const excluded of config.excluded_directories) {
      const normalizedExcluded = excluded.replace(/\\/g, '/').toLowerCase().replace(/\/+$/, '');
      if (
        normalizedCwd === normalizedExcluded ||
        normalizedCwd.startsWith(`${normalizedExcluded}/`)
      ) {
        return false;
      }
    }
  }
  return true;
}
