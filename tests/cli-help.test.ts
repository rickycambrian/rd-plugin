import { describe, it, expect } from 'vitest';
import { wantsHelp } from '../src/lib/cli-help.js';

describe('wantsHelp', () => {
  it('detects the long flag', () => {
    expect(wantsHelp(['--help'])).toBe(true);
    expect(wantsHelp(['--limit', '50', '--help'])).toBe(true);
  });

  it('detects the short flag', () => {
    expect(wantsHelp(['-h'])).toBe(true);
    expect(wantsHelp(['session-abc', '-h'])).toBe(true);
  });

  it('is false for real invocations', () => {
    expect(wantsHelp([])).toBe(false);
    expect(wantsHelp(['--limit', '100'])).toBe(false);
    expect(wantsHelp(['--spawn-flush', '--final'])).toBe(false);
    expect(wantsHelp(['session-abc', '--final'])).toBe(false);
  });
});
