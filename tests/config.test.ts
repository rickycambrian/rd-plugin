import { describe, it, expect } from 'vitest';
import { resolveSink, shouldTrack, type RdConfig } from '../src/lib/config.js';

function makeConfig(overrides: Partial<RdConfig> = {}): RdConfig {
  return {
    api_url: 'http://localhost',
    home_url: 'http://home.local',
    api_key: undefined,
    private_key: undefined,
    enabled: true,
    excluded_directories: [],
    sink: undefined,
    track_messages: true,
    track_files: true,
    track_git: true,
    log_level: 'info',
    ...overrides,
  };
}

describe('resolveSink', () => {
  it('env RICKYDATA_KG_SINK wins over config and auto', () => {
    const config = makeConfig({ sink: 'off', private_key: '0xabc' });
    expect(resolveSink(config, { RICKYDATA_KG_SINK: 'gateway' } as NodeJS.ProcessEnv)).toBe('gateway');
    expect(resolveSink(config, { RICKYDATA_KG_SINK: 'direct' } as NodeJS.ProcessEnv)).toBe('direct');
  });

  it('config.sink wins when no env override', () => {
    expect(resolveSink(makeConfig({ sink: 'gateway', private_key: '0xabc' }), {} as NodeJS.ProcessEnv)).toBe('gateway');
    expect(resolveSink(makeConfig({ sink: 'off', private_key: '0xabc' }), {} as NodeJS.ProcessEnv)).toBe('off');
  });

  it('auto = direct when a private_key is present', () => {
    expect(resolveSink(makeConfig({ private_key: '0xabc' }), {} as NodeJS.ProcessEnv)).toBe('direct');
  });

  it('auto = off when no private_key and no env gateway', () => {
    expect(resolveSink(makeConfig(), {} as NodeJS.ProcessEnv)).toBe('off');
  });

  it('gateway env needs no local config', () => {
    expect(resolveSink(makeConfig(), { RICKYDATA_KG_SINK: 'gateway' } as NodeJS.ProcessEnv)).toBe('gateway');
  });

  it('ignores an invalid env value and falls through', () => {
    expect(resolveSink(makeConfig({ sink: 'direct', private_key: '0xabc' }), { RICKYDATA_KG_SINK: 'bogus' } as NodeJS.ProcessEnv)).toBe('direct');
  });
});

describe('shouldTrack', () => {
  it('false when disabled', () => {
    expect(shouldTrack(makeConfig({ enabled: false }), '/work/proj')).toBe(false);
  });

  it('true for a normal dir', () => {
    expect(shouldTrack(makeConfig(), '/work/proj')).toBe(true);
  });

  it('false for an excluded dir and its subdirs', () => {
    const config = makeConfig({ excluded_directories: ['/secret'] });
    expect(shouldTrack(config, '/secret')).toBe(false);
    expect(shouldTrack(config, '/secret/nested/deep')).toBe(false);
  });

  it('does not exclude a sibling with a shared prefix', () => {
    const config = makeConfig({ excluded_directories: ['/secret'] });
    expect(shouldTrack(config, '/secret-not-really')).toBe(true);
  });

  it('is case-insensitive and trailing-slash tolerant', () => {
    const config = makeConfig({ excluded_directories: ['/Secret/'] });
    expect(shouldTrack(config, '/secret')).toBe(false);
  });
});
