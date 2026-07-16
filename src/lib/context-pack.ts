import { postJson } from './http.js';
import type { DeriveHeaders } from './derive.js';
import { createHash } from 'node:crypto';

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
  /** Authenticated rickydata_home compiler; preferred over the sheet fallback. */
  homeUrl?: string;
  homeToken?: string;
  repoId?: string;
  /** Optional prospective task/work slug; never place the private prompt in the URL. */
  taskSlug?: string;
  /** Compiler token budget. Session warm-start is deliberately smaller. */
  homeBudget?: number;
}

export interface ContextPack {
  text: string;
  sheetIds: string[];
  source: 'home' | 'answer-sheets-fallback' | 'empty';
  coverageStatus: 'complete' | 'bounded' | 'incomplete';
  reproducibilityHash?: string;
  packId?: string;
  policyHash?: `sha256:${string}`;
  selectedManifestHash?: `sha256:${string}`;
  corpusWatermark?: string;
  omissions: Array<{ source: string; reason: string; count?: number }>;
}

interface HomeContextPack {
  version?: string;
  reproducibility_hash?: string;
  context_pack_id?: string;
  policy_hash?: string;
  selected_manifest_hash?: string;
  corpus_watermark?: string;
  token_estimate?: number;
  anchor?: { kind?: string; surface?: string; taskSlug?: string; repoId?: string; lesson?: string };
  brief?: string;
  invariants?: Array<{ text?: string; source_ref?: string }>;
  verification?: Array<{ kind?: string; status?: string; evidence_ref?: string }>;
  work_in_progress?: Array<{ slug?: string; name?: string; issue_ref?: string; issue_state?: string; linked_prs?: string[]; session_artifacts?: number }>;
  wiki?: Array<{ slug?: string; title?: string; summary?: string; status?: string; key_claims?: Array<{ text?: string; source_ref?: string; confidence_tier?: string }> }>;
  lessons?: Array<{ text?: string; confidence?: number; source_ref?: string }>;
  decisions?: Array<{ title?: string; action?: string; decided_at?: string; source_ref_id?: string }>;
  traps?: Array<{ name?: string; hook?: string }>;
  open_questions?: Array<{ question?: string; id?: string }>;
  selected_items?: Array<{ section?: string; id?: string; content_hash?: string; rank_reason?: string; token_estimate?: number }>;
  omitted?: Array<{ section?: string; count?: number; reason?: string }>;
  omitted_items?: Array<{ section?: string; id?: string; reason?: string }>;
  coverage?: { status?: string; sources?: Array<{ source?: string; status?: string; count?: number; reason?: string }> };
}

function homeCoverageStatus(pack: HomeContextPack): ContextPack['coverageStatus'] {
  const status = pack.coverage?.status;
  return status === 'complete' || status === 'bounded' || status === 'incomplete' ? status : 'incomplete';
}

function renderHomePack(pack: HomeContextPack): string {
  const status = homeCoverageStatus(pack);
  const anchor = pack.anchor ?? {};
  const anchorKey = anchor.surface ?? anchor.taskSlug ?? anchor.repoId ?? anchor.lesson ?? 'unknown';
  const lines = [
    `## RickyData compiled context — ${anchor.kind ?? 'unknown'}:${anchorKey}`,
    `[CONTEXT COVERAGE — ${status.toUpperCase()}]`,
    `Reproducibility hash: ${pack.reproducibility_hash ?? 'unavailable'}; token estimate: ${pack.token_estimate ?? 'unavailable'}`,
  ];
  if (pack.brief?.trim()) lines.push('', pack.brief.trim());
  const failed = (pack.coverage?.sources ?? []).filter((source) => source.status === 'error');
  if (!pack.coverage) lines.push('- SOURCE FAILED: context_pack_coverage — legacy pack omitted source-health metadata');
  for (const source of failed) lines.push(`- SOURCE FAILED: ${source.source ?? 'unknown'} — ${source.reason ?? 'unknown error'}`);

  const section = (title: string, values: string[]): void => {
    if (values.length > 0) lines.push('', `${title}:`, ...values.map((value) => `- ${value}`));
  };
  section('Invariants', (pack.invariants ?? []).map((row) => `${row.text ?? ''} [${row.source_ref ?? 'source unavailable'}]`));
  section('Verification gates', (pack.verification ?? []).map((row) => `${row.kind ?? 'gate'}: ${row.status ?? 'unknown'}${row.evidence_ref ? ` [${row.evidence_ref}]` : ''}`));
  section('Work in progress', (pack.work_in_progress ?? []).map((row) => {
    const refs = [row.issue_ref, row.issue_state, ...(row.linked_prs ?? []), row.session_artifacts !== undefined ? `${row.session_artifacts} session artifact(s)` : undefined].filter(Boolean);
    return `${row.name ?? row.slug ?? 'unnamed'} [${row.slug ?? 'unknown'}]${refs.length ? ` — ${refs.join('; ')}` : ''}`;
  }));
  section('Knowledge (wiki)', (pack.wiki ?? []).flatMap((row) => [
    `${row.title ?? row.slug ?? 'untitled'}${row.status === 'stale' ? ' (STALE)' : ''}: ${row.summary ?? ''} [wiki:${row.slug ?? 'unknown'}]`,
    ...(row.key_claims ?? []).map((claim) => `  ${claim.text ?? ''} [${claim.source_ref ?? 'source unavailable'}; ${claim.confidence_tier ?? 'unknown'}]`),
  ]));
  section('Lessons', (pack.lessons ?? []).map((row) => `${(row.text ?? '').replace(/\n+/g, ' ')} [${row.source_ref ?? 'source unavailable'}; confidence ${row.confidence ?? 'unknown'}]`));
  section('Recent human decisions', (pack.decisions ?? []).map((row) => `${row.title ?? 'untitled'} (${row.action ?? 'unknown'}, ${row.decided_at ?? 'date unavailable'}) [${row.source_ref_id ?? 'source unavailable'}]`));
  section('Known traps', (pack.traps ?? []).map((row) => `${row.name ?? 'unnamed'}: ${row.hook ?? ''}`));
  section('Open questions', (pack.open_questions ?? []).map((row) => `${row.question ?? ''} [${row.id ?? 'id unavailable'}]`));
  section('Selected context manifest', (pack.selected_items ?? []).map((row) => `${row.section ?? 'unknown'}:${row.id ?? 'unknown'} sha256=${row.content_hash ?? 'unavailable'} tokens=${row.token_estimate ?? 'unknown'}${row.rank_reason ? ` rank=${row.rank_reason}` : ''}`));
  section('Context exclusions', [
    ...(pack.omitted ?? []).map((row) => `${row.count ?? 0} ${row.section ?? 'unknown'} item(s): ${row.reason ?? 'unknown'}`),
    ...(pack.omitted_items ?? []).map((row) => `${row.section ?? 'unknown'}:${row.id ?? 'unknown'}: ${row.reason ?? 'unknown'}`),
  ]);
  return lines.join('\n');
}

async function fetchHomePack(input: ContextPackInput): Promise<HomeContextPack | null> {
  if (!input.homeUrl || !input.homeToken || !input.repoId) return null;
  const params = new URLSearchParams({
    repo: input.repoId,
    budget: String(input.homeBudget ?? 24_000),
    consumer: 'plugin',
  });
  if (input.taskSlug) params.set('task', input.taskSlug);
  const controller = new AbortController();
  // A real cold rd-plugin repo compile crossed the old 4.2s cap and forced an
  // incomplete fallback; warm SWR reads are still fast. Completeness is the
  // primary contract, so reserve most of the SessionStart budget for Home and
  // keep only a short answer-sheet fallback window.
  const timeoutMs = Math.max(500, Math.min(input.timeoutMs ?? 8_500, 7_500));
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${input.homeUrl.replace(/\/$/, '')}/api/context-pack?${params}`, {
      headers: { Accept: 'application/json', Authorization: `Bearer ${input.homeToken}` },
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const pack = (await res.json()) as HomeContextPack;
    return pack.version === 'context-pack/v1' ? pack : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
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
  const triedHome = Boolean(input.homeUrl && input.homeToken && input.repoId);
  const homePack = await fetchHomePack(input);
  if (homePack) {
    const shaRef = (value: string | undefined): `sha256:${string}` | undefined => {
      if (!value) return undefined;
      const normalized = value.startsWith('sha256:') ? value : `sha256:${value}`;
      return /^sha256:[0-9a-f]{64}$/.test(normalized) ? normalized as `sha256:${string}` : undefined;
    };
    const selectedManifestHash = shaRef(homePack.selected_manifest_hash)
      ?? `sha256:${createHash('sha256').update(JSON.stringify(homePack.selected_items ?? [])).digest('hex')}` as const;
    return {
      text: renderHomePack(homePack),
      sheetIds: [],
      source: 'home',
      coverageStatus: homeCoverageStatus(homePack),
      ...(homePack.reproducibility_hash ? { reproducibilityHash: homePack.reproducibility_hash } : {}),
      ...(homePack.context_pack_id ? { packId: homePack.context_pack_id } : {}),
      ...(shaRef(homePack.policy_hash) ? { policyHash: shaRef(homePack.policy_hash) } : {}),
      selectedManifestHash,
      ...(homePack.corpus_watermark ? { corpusWatermark: homePack.corpus_watermark } : {}),
      omissions: [
        ...(homePack.omitted ?? []).map((row) => ({ source: row.section ?? 'unknown', reason: row.reason ?? 'unknown', ...(row.count !== undefined ? { count: row.count } : {}) })),
        ...(homePack.omitted_items ?? []).map((row) => ({ source: `${row.section ?? 'unknown'}:${row.id ?? 'unknown'}`, reason: row.reason ?? 'unknown', count: 1 })),
        ...(homePack.coverage?.sources ?? []).filter((row) => row.status !== 'ok').map((row) => ({ source: row.source ?? 'unknown', reason: row.reason ?? row.status ?? 'unknown', ...(row.count !== undefined ? { count: row.count } : {}) })),
      ],
    };
  }
  const maxChars = input.maxChars ?? DEFAULT_MAX_CHARS;
  const fallbackInput = triedHome ? { ...input, timeoutMs: Math.min(input.timeoutMs ?? 5000, 700) } : input;
  const [matches, prefs, decisions] = await Promise.all([
    matchSheets(fallbackInput).catch(() => []),
    listByCategory(fallbackInput, 'user_preference', 8).catch(() => []),
    listByCategory(fallbackInput, 'project_decision', 5).catch(() => []),
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

  if (lines.length === 0) {
    return triedHome
      ? { text: '## RickyData context\n[CONTEXT COVERAGE — INCOMPLETE]\n- Home compiled context pack unavailable; no answer-sheet fallback matched.', sheetIds: [], source: 'empty', coverageStatus: 'incomplete', omissions: [{ source: 'home-context-pack', reason: 'unavailable' }] }
      : { text: '', sheetIds: [], source: 'empty', coverageStatus: 'incomplete', omissions: [{ source: 'context-pack', reason: 'not-configured' }] };
  }
  const warning = triedHome
    ? '[CONTEXT COVERAGE — INCOMPLETE]\n- Home compiled context pack unavailable; answer-sheet fallback only.\n'
    : '';
  return { text: `## ${heading}\n${warning}${lines.join('\n')}`, sheetIds, source: 'answer-sheets-fallback', coverageStatus: 'incomplete', omissions: [{ source: 'home-context-pack', reason: triedHome ? 'unavailable-answer-sheet-fallback' : 'not-configured' }] };
}
