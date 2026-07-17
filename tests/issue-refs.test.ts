import { describe, expect, it } from 'vitest';
import { extractIssueRefs, sessionIssueRefs } from '../src/lib/issue-refs.js';

const ctx = { owner: 'rickydata-indexer', repo: 'rd-plugin' };

describe('extractIssueRefs', () => {
  it('extracts fully-qualified owner/repo#N', () => {
    const refs = extractIssueRefs('see acme/widgets#42 please', ctx);
    expect(refs).toEqual([{ owner: 'acme', repo: 'widgets', number: 42, tier: 'explicit_ref' }]);
  });

  it('extracts github issue URLs and excludes pull URLs', () => {
    const refs = extractIssueRefs(
      'fix https://github.com/acme/widgets/issues/7 not https://github.com/acme/widgets/pull/8',
      ctx,
    );
    expect(refs).toEqual([{ owner: 'acme', repo: 'widgets', number: 7, tier: 'explicit_ref' }]);
  });

  it('attributes bare #N to the current repo', () => {
    const refs = extractIssueRefs('closes #123', ctx);
    expect(refs).toEqual([{ owner: 'rickydata-indexer', repo: 'rd-plugin', number: 123, tier: 'explicit_ref' }]);
  });

  it('does not double-count the #N inside owner/repo#N as a bare ref', () => {
    const refs = extractIssueRefs('acme/widgets#42', ctx);
    expect(refs).toEqual([{ owner: 'acme', repo: 'widgets', number: 42, tier: 'explicit_ref' }]);
  });

  it('ignores refs inside fenced (``` and ~~~) and inline code', () => {
    const prompt = 'real #1 here\n```\ncode #999 ignore\n```\n~~~\nmore #888 ignore\n~~~\ninline `#777 ignore` too';
    const refs = extractIssueRefs(prompt, ctx);
    expect(refs).toEqual([{ owner: 'rickydata-indexer', repo: 'rd-plugin', number: 1, tier: 'explicit_ref' }]);
  });

  it('extracts a slug issue-<repo>-<N> and resolves owner when repo matches context', () => {
    const refs = extractIssueRefs('working on issue-rd-plugin-42 today', ctx);
    expect(refs).toEqual([{ owner: 'rickydata-indexer', repo: 'rd-plugin', number: 42, tier: 'slug_branch' }]);
  });

  it('extracts a slug for a repo with hyphens; leaves owner undefined when repo differs', () => {
    const refs = extractIssueRefs('cross ref issue-other-repo-9', ctx);
    expect(refs).toEqual([{ owner: undefined, repo: 'other-repo', number: 9, tier: 'slug_branch' }]);
  });

  it('reads the branch through the slug matcher', () => {
    const refs = extractIssueRefs('no refs in text', { ...ctx, branch: 'issue-rd-plugin-77-fix' });
    expect(refs).toEqual([{ owner: 'rickydata-indexer', repo: 'rd-plugin', number: 77, tier: 'slug_branch' }]);
  });

  it('prefers the explicit tier when the same issue appears both ways', () => {
    const refs = extractIssueRefs('acme/widgets#5 and issue-widgets-5', { owner: 'acme', repo: 'widgets' });
    expect(refs).toEqual([{ owner: 'acme', repo: 'widgets', number: 5, tier: 'explicit_ref' }]);
  });

  it('drops a bare #N when there is no repo context to attribute it to', () => {
    expect(extractIssueRefs('orphan #5', {})).toEqual([]);
  });

  it('returns nothing for text with no refs', () => {
    expect(extractIssueRefs('just a normal prompt about colors', ctx)).toEqual([]);
  });
});

describe('sessionIssueRefs', () => {
  it('unions refs across prompts and splits canonical strings by tier', () => {
    const facts = sessionIssueRefs([
      { prompt: 'start acme/widgets#1', repo: { owner: 'acme', repo: 'widgets' } },
      { prompt: 'and #2', repo: { owner: 'acme', repo: 'widgets' } },
      { prompt: 'later issue-widgets-3', repo: { owner: 'acme', repo: 'widgets', branch: 'issue-widgets-4' } },
    ]);
    expect(facts.explicit).toEqual(['acme/widgets#1', 'acme/widgets#2']);
    expect(facts.slug).toEqual(['acme/widgets#3', 'acme/widgets#4']);
  });

  it('is empty when no prompt carries a ref', () => {
    const facts = sessionIssueRefs([{ prompt: 'hello', repo: { owner: 'a', repo: 'b' } }]);
    expect(facts.explicit).toEqual([]);
    expect(facts.slug).toEqual([]);
  });

  it('canonicalizes an owner-less slug ref as repo#N', () => {
    const facts = sessionIssueRefs([{ prompt: 'issue-elsewhere-9', repo: { owner: 'a', repo: 'b' } }]);
    expect(facts.slug).toEqual(['elsewhere#9']);
  });
});
