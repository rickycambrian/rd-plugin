import { readHookInput } from './lib/hook-input.js';
import { loadConfig, resolveSink, shouldTrack } from './lib/config.js';
import { setLogLevel, log } from './lib/log.js';
import { mintHomeWalletToken } from './lib/home-auth.js';
import { writeAll } from './lib/stdout.js';
import { wantsHelp } from './lib/cli-help.js';

const USAGE = `usage: node monitor-advisory.mjs

UserPromptSubmit hook: fetch a session advisory from home and inject it as
additionalContext. Hard ${'~'}500ms timeout, fail-open on ANY error — never blocks
or slows a prompt. Emits nothing when home is down or has no advisory.

  -h, --help   show this help and exit
`;

const ADVISORY_TIMEOUT_MS = 500;

/**
 * Pull the advisory text out of whatever shape home returns. Defensive by
 * construction — the route ships later (Workstream D) and its envelope may be
 * `{text}`, `{advisory:{text}}`, or `{advisories:[{text},…]}`. Anything else
 * yields no injection.
 */
export function advisoryTextFromResponse(json: unknown): string | undefined {
  if (!json || typeof json !== 'object') return undefined;
  const obj = json as Record<string, unknown>;
  const pick = (v: unknown): string | undefined => {
    if (typeof v === 'string' && v.trim()) return v.trim();
    if (v && typeof v === 'object' && typeof (v as Record<string, unknown>).text === 'string') {
      const t = (v as Record<string, string>).text.trim();
      return t || undefined;
    }
    return undefined;
  };
  const direct = pick(obj.text) ?? pick(obj.advisory);
  if (direct) return direct;
  if (Array.isArray(obj.advisories)) {
    const texts = obj.advisories.map(pick).filter((t): t is string => Boolean(t));
    if (texts.length) return texts.join('\n\n');
  }
  return undefined;
}

/** GET the advisory with a hard timeout. Resolves undefined on ANY failure. */
export async function fetchAdvisory(
  homeUrl: string,
  sessionId: string,
  token: string | undefined,
  timeoutMs = ADVISORY_TIMEOUT_MS,
): Promise<string | undefined> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const url = `${homeUrl.replace(/\/$/, '')}/api/monitor/advisory?sessionId=${encodeURIComponent(sessionId)}`;
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (token) headers.Authorization = `Bearer ${token}`;
    const res = await fetch(url, { method: 'GET', headers, signal: controller.signal });
    if (!res.ok) return undefined;
    const text = await res.text();
    return advisoryTextFromResponse(text ? JSON.parse(text) : null);
  } catch {
    return undefined; // fail-open: timeout, 404, offline, bad JSON — all silent.
  } finally {
    clearTimeout(timer);
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (wantsHelp(args)) {
    process.stdout.write(USAGE);
    return;
  }
  const input = await readHookInput();
  const config = loadConfig();
  setLogLevel(config.log_level);
  if (resolveSink(config) === 'off' || !shouldTrack(config, input.cwd)) return;

  const sessionId = typeof input.session_id === 'string' && input.session_id ? input.session_id : '';
  if (!sessionId || !config.home_url) return;

  // Minting the home token is local crypto (~1ms); fail-open to no-auth.
  let token: string | undefined;
  if (config.private_key) {
    try { token = await mintHomeWalletToken(config.private_key); } catch { /* no-auth */ }
  }

  const text = await fetchAdvisory(config.home_url, sessionId, token);
  if (!text) return;

  await writeAll(process.stdout, JSON.stringify({
    hookSpecificOutput: { hookEventName: 'UserPromptSubmit', additionalContext: text },
  }));
  log('info', 'advisory injected', { sessionId, length: text.length });
}

main()
  .catch((err) => {
    try { log('debug', 'monitor-advisory failed (fail-open)', { error: (err as Error).message }); } catch { /* ignore */ }
  })
  .finally(() => { process.exitCode = 0; });
