import { describe, expect, it } from 'vitest';
import { advisoryTextFromResponse, fetchAdvisory } from '../src/monitor-advisory.js';

describe('advisoryTextFromResponse', () => {
  it('reads a top-level text field', () => {
    expect(advisoryTextFromResponse({ text: '  belongs to #42  ' })).toBe('belongs to #42');
  });

  it('reads a nested advisory.text field', () => {
    expect(advisoryTextFromResponse({ advisory: { text: 'dup of #7' } })).toBe('dup of #7');
  });

  it('joins an advisories array', () => {
    expect(advisoryTextFromResponse({ advisories: [{ text: 'a' }, { text: 'b' }, { nope: 1 }] })).toBe('a\n\nb');
  });

  it('returns undefined for empty / unrecognized shapes', () => {
    expect(advisoryTextFromResponse(null)).toBeUndefined();
    expect(advisoryTextFromResponse({})).toBeUndefined();
    expect(advisoryTextFromResponse({ text: '   ' })).toBeUndefined();
    expect(advisoryTextFromResponse({ advisories: [] })).toBeUndefined();
    expect(advisoryTextFromResponse('a string')).toBeUndefined();
  });
});

describe('fetchAdvisory', () => {
  it('fails open (undefined) when home is unreachable, within the timeout', async () => {
    // Reserved-for-doc TEST-NET IP that black-holes connects → forces the abort path.
    const start = Date.now();
    const result = await fetchAdvisory('http://192.0.2.1:9', 'sess-1', undefined, 300);
    expect(result).toBeUndefined();
    expect(Date.now() - start).toBeLessThan(1500);
  });
});
