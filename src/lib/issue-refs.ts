/**
 * The ONE issue-ref grammar (shared contract with home's src/issues/refs.ts).
 * Pure and allocation-light -- rd-plugin runs this on UserPromptSubmit to make
 * prompt->GitHub-issue linkage deterministic at the source. See the contract
 * message to the `linker` teammate; keep both parsers byte-identical.
 */

export type IssueTier = 'explicit_ref' | 'slug_branch';

export interface IssueRef {
  owner?: string;
  repo?: string;
  number: number;
  tier: IssueTier;
}

export interface RefContext {
  /** Current repo owner (lowercased) for attributing bare #N and matching slugs. */
  owner?: string;
  /** Current repo name for attributing bare #N and matching slugs. */
  repo?: string;
  /** Current git branch -- scanned with the slug matcher. */
  branch?: string;
}

const OWNER_REPO = /([A-Za-z0-9][-A-Za-z0-9_.]*)\/([A-Za-z0-9][-A-Za-z0-9_.]*)#(\d+)/g;
const ISSUE_URL = /https?:\/\/github\.com\/([^/\s#]+)\/([^/\s#]+)\/issues\/(\d+)/gi;
// Bare #N: the char before `#` must not be a word char, `/`, `#`, or `&` so we do
// not re-match the `#N` tail of owner/repo#N (or ##) or an HTML entity like `&#123;`.
const BARE = /(?<![\w/#&])#(\d+)/g;
// slug issue-<repo>-<N>. Greedy repo: the trailing `-<digits>` is the issue
// number, repo is everything before it (matches home's SLUG_RE):
// issue-a-1-2 -> repo=a-1,num=2; issue-rd-plugin-42 -> repo=rd-plugin,num=42.
const SLUG = /\bissue-([a-z0-9][-a-z0-9_.]*)-(\d+)\b/gi;

/** ponytail: naive code strip -- ``` / ~~~ fenced blocks then `inline` spans; malformed/nested/unbalanced fall through. */
function stripCode(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/~~~[\s\S]*?~~~/g, ' ')
    .replace(/`[^`]*`/g, ' ');
}

function keyOf(ref: IssueRef): string {
  return [ref.owner ?? '', ref.repo ?? '', ref.number].join('|');
}

/**
 * Extract issue refs from prompt text (+ optional branch) under the current-repo
 * attribution context. Explicit-tier refs win over slug-tier for the same issue.
 */
export function extractIssueRefs(prompt: string, ctx: RefContext = {}): IssueRef[] {
  const text = stripCode(typeof prompt === 'string' ? prompt : '');
  const byKey = new Map<string, IssueRef>();

  const add = (ref: IssueRef): void => {
    const key = keyOf(ref);
    const prior = byKey.get(key);
    // explicit_ref outranks slug_branch; first explicit wins otherwise.
    if (!prior || (prior.tier === 'slug_branch' && ref.tier === 'explicit_ref')) {
      byKey.set(key, ref);
    }
  };

  for (const m of text.matchAll(OWNER_REPO)) {
    add({ owner: m[1].toLowerCase(), repo: m[2], number: Number(m[3]), tier: 'explicit_ref' });
  }
  for (const m of text.matchAll(ISSUE_URL)) {
    add({ owner: m[1].toLowerCase(), repo: m[2], number: Number(m[3]), tier: 'explicit_ref' });
  }
  for (const m of text.matchAll(BARE)) {
    if (ctx.owner && ctx.repo) {
      add({ owner: ctx.owner.toLowerCase(), repo: ctx.repo, number: Number(m[1]), tier: 'explicit_ref' });
    }
  }
  const slugFrom = (source: string): void => {
    for (const m of source.matchAll(SLUG)) {
      const slugRepo = m[1];
      const number = Number(m[2]);
      const owner = ctx.owner && ctx.repo && slugRepo.toLowerCase() === ctx.repo.toLowerCase()
        ? ctx.owner.toLowerCase()
        : undefined;
      add({ owner, repo: slugRepo, number, tier: 'slug_branch' });
    }
  };
  slugFrom(text);
  if (ctx.branch) slugFrom(ctx.branch);

  return [...byKey.values()];
}

/** Canonical "owner/repo#N" (or "repo#N" when owner is unknown). */
export function canonicalRef(ref: IssueRef): string {
  const left = ref.owner ? `${ref.owner}/${ref.repo}` : ref.repo ?? '';
  return `${left}#${ref.number}`;
}

export interface PromptWithRepo {
  prompt?: string;
  repo?: { owner?: string; repo?: string; branch?: string };
}

export interface SessionIssueFacts {
  /** Canonical strings for explicit_ref tier. */
  explicit: string[];
  /** Canonical strings for slug_branch tier. */
  slug: string[];
}

/**
 * Union issue refs across a session's prompts into the two tier-keyed canonical
 * string arrays stamped onto the ClaudeCodeSession node. An explicit hit for an
 * issue suppresses the slug hit for the same issue.
 */
export function sessionIssueRefs(prompts: PromptWithRepo[]): SessionIssueFacts {
  const byKey = new Map<string, IssueRef>();
  for (const p of prompts) {
    const ctx: RefContext = { owner: p.repo?.owner, repo: p.repo?.repo, branch: p.repo?.branch };
    for (const ref of extractIssueRefs(p.prompt ?? '', ctx)) {
      const key = keyOf(ref);
      const prior = byKey.get(key);
      if (!prior || (prior.tier === 'slug_branch' && ref.tier === 'explicit_ref')) byKey.set(key, ref);
    }
  }
  const explicit: string[] = [];
  const slug: string[] = [];
  for (const ref of byKey.values()) {
    (ref.tier === 'explicit_ref' ? explicit : slug).push(canonicalRef(ref));
  }
  explicit.sort();
  slug.sort();
  return { explicit, slug };
}
