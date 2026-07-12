import { describe, it, expect } from 'vitest';
import { parseSetupArgs, applySetup, maskConfig } from '../src/lib/setup-core.js';

describe('parseSetupArgs', () => {
  it('parses typed key=value pairs and the --force flag', () => {
    const { updates, force, errors } = parseSetupArgs([
      'api_url=http://x',
      'enabled=false',
      'excluded_directories=/a,/b',
      '--force',
    ]);
    expect(force).toBe(true);
    expect(errors).toEqual([]);
    expect(updates.api_url).toBe('http://x');
    expect(updates.enabled).toBe(false);
    expect(updates.excluded_directories).toEqual(['/a', '/b']);
  });

  it('rejects an invalid sink and an invalid boolean', () => {
    const { updates, errors } = parseSetupArgs(['sink=nope', 'track_git=maybe']);
    expect(updates.sink).toBeUndefined();
    expect(updates.track_git).toBeUndefined();
    expect(errors.length).toBe(2);
  });

  it('ignores unknown keys', () => {
    const { updates } = parseSetupArgs(['totally_unknown=1']);
    expect(updates).toEqual({});
  });
});

describe('applySetup', () => {
  it('adds new keys and preserves unrelated existing keys', () => {
    const result = applySetup({ private_key: '0xabc' }, { sink: 'direct' }, false);
    expect(result.config.private_key).toBe('0xabc');
    expect(result.config.sink).toBe('direct');
    expect(result.applied).toContain('sink');
  });

  it('never overwrites an existing differing key without --force', () => {
    const result = applySetup({ api_url: 'http://old' }, { api_url: 'http://new' }, false);
    expect(result.config.api_url).toBe('http://old');
    expect(result.skipped).toContain('api_url');
    expect(result.applied).not.toContain('api_url');
  });

  it('overwrites with --force', () => {
    const result = applySetup({ api_url: 'http://old' }, { api_url: 'http://new' }, true);
    expect(result.config.api_url).toBe('http://new');
    expect(result.applied).toContain('api_url');
  });

  it('is a no-op when the value is unchanged', () => {
    const result = applySetup({ sink: 'direct' }, { sink: 'direct' }, false);
    expect(result.applied).toEqual([]);
    expect(result.skipped).toEqual([]);
  });
});

describe('maskConfig', () => {
  it('redacts secret values', () => {
    const masked = maskConfig({ api_key: 'sk-secret', private_key: '0xdead', api_url: 'http://x' });
    expect(masked.api_key).toBe('***');
    expect(masked.private_key).toBe('***');
    expect(masked.api_url).toBe('http://x');
  });
});
