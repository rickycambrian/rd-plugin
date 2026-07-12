import { describe, it, expect } from 'vitest';
import { parseSetupArgs, applySetup, applyWalletVerification, maskConfig } from '../src/lib/setup-core.js';

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

describe('applyWalletVerification', () => {
  it('leaves the config untouched on a successful verification', () => {
    const config = { private_key: '0xabc', api_url: 'http://x' };
    const result = applyWalletVerification(config, { ok: true, address: '0xWallet' });
    expect(result.config).toEqual(config);
    expect(result.message).toContain('verified');
    expect(result.message).toContain('0xWallet');
  });

  it('removes private_key and preserves everything else on a failed verification', () => {
    const config = { private_key: '0xabc', api_url: 'http://x', api_key: 'k' };
    const result = applyWalletVerification(config, { ok: false, error: 'derive-challenge failed: 500' });
    expect(result.config.private_key).toBeUndefined();
    expect(result.config.api_url).toBe('http://x');
    expect(result.config.api_key).toBe('k');
    expect(result.message).toContain('FAILED');
    expect(result.message).toContain('derive-challenge failed: 500');
  });

  it('does not mutate the input config object on failure', () => {
    const config = { private_key: '0xabc' };
    applyWalletVerification(config, { ok: false, error: 'x' });
    expect(config.private_key).toBe('0xabc');
  });
});
