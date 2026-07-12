import { postJson } from './http.js';
import type { DeriveHeaders } from './derive.js';

/**
 * SessionStart context-pack builder. Ports the answer-sheets injection: a
 * relevance match on a synthetic query plus always-on user_preference /
 * project_decision sheets, merged and budget-trimmed into a single text block.
 * Fully fail-open — any network error yields an empty pack (inject nothing).
 */

const DEFAULT_MAX_CHARS = 4000;

interface Sheet {
  id?: string;
  sheet_id?: string;
  title?: string;
  solution_summary?: string;
  problem_category?: string;
  match_score?: number;
}

export interface ContextPackInput {
  apiUrl: string;
  apiKey: string;
  deriveHeaders?: DeriveHeaders;
  query: string;
  context?: Record<string, unknown>;
  heading?: string;
  timeoutMs?: number;
  maxChars?: number;
}

export interface ContextPack {
  text: string;
  sheetIds: string[];
}

function headers(apiKey: string, derive?: DeriveHeaders): Record<string, string> {
  const h: Record<string, string> = { Accept: 'application/json' };
  if (apiKey) h.Authorization = `Bearer ${apiKey}`;
  if (derive) Object.assign(h, derive);
  return h;
}

function sheetId(sheet: Sheet): string | undefined {
  return sheet.sheet_id ?? sheet.id;
}

async function matchSheets(input: ContextPackInput): Promise<Sheet[]> {
  const text = input.query.trim();
  if (!text) return [];
  const base = input.apiUrl.replace(/\/$/, '');
  const body: Record<string, unknown> = { error_text: text, limit: 5, min_confidence: 0, include_public: true };
  if (input.context && Object.keys(input.context).length > 0) body.context = input.context;
  const res = await postJson(`${base}/api/v1/answer-sheets/match`, body, headers(input.apiKey, input.deriveHeaders), input.timeoutMs ?? 5000);
  if (!res.ok || !res.json || typeof res.json !== 'object') return [];
  const matches = (res.json as { matches?: unknown }).matches;
  return Array.isArray(matches) ? (matches as Sheet[]) : [];
}

async function listByCategory(input: ContextPackInput, category: string, limit: number): Promise<Sheet[]> {
  const base = input.apiUrl.replace(/\/$/, '');
  const params = new URLSearchParams({ problem_category: category, min_confidence: '0', limit: String(limit) });
  const url = `${base}/api/v1/answer-sheets?${params.toString()}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), input.timeoutMs ?? 5000);
  try {
    const res = await fetch(url, { method: 'GET', headers: headers(input.apiKey, input.deriveHeaders), signal: controller.signal });
    if (!res.ok) return [];
    const json = (await res.json()) as { items?: unknown };
    return Array.isArray(json.items) ? (json.items as Sheet[]) : [];
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}

function formatLine(sheet: Sheet): string | null {
  const title = (sheet.title || '').trim();
  const summary = (sheet.solution_summary || '').trim();
  if (!title && !summary) return null;
  if (title && summary) return `- ${title}: ${summary}`;
  return `- ${title || summary}`;
}

/**
 * Gather + format a context pack. Runs the three retrievals in parallel so total
 * latency is bounded by one timeout. Returns `{ text: '', sheetIds: [] }` when
 * everything is empty or injection would exceed no useful content.
 */
export async function gatherContextPack(input: ContextPackInput): Promise<ContextPack> {
  const maxChars = input.maxChars ?? DEFAULT_MAX_CHARS;
  const [matches, prefs, decisions] = await Promise.all([
    matchSheets(input).catch(() => []),
    listByCategory(input, 'user_preference', 8).catch(() => []),
    listByCategory(input, 'project_decision', 5).catch(() => []),
  ]);

  const seen = new Set<string>();
  const sheetIds: string[] = [];
  const lines: string[] = [];
  let used = 0;
  const heading = input.heading ?? 'Remembered context (KFDB)';

  for (const sheet of [...prefs, ...decisions, ...matches]) {
    const id = sheetId(sheet);
    if (id) {
      if (seen.has(id)) continue;
      seen.add(id);
    }
    const line = formatLine(sheet);
    if (!line) continue;
    if (used + line.length + 1 > maxChars) break;
    lines.push(line);
    used += line.length + 1;
    if (id) sheetIds.push(id);
  }

  if (lines.length === 0) return { text: '', sheetIds: [] };
  return { text: `## ${heading}\n${lines.join('\n')}`, sheetIds };
}
