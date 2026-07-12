import { describe, it, expect } from 'vitest';
import {
  CODEX_HOOK_EVENTS,
  analyzeWiring,
  applyWiring,
  appendEventBlocks,
  buildEventBlock,
  buildFreshWiringBlock,
  repointLegacyCommands,
} from '../src/codex/toml-wiring.js';

const NEW_COMMAND = 'node /Users/x/rd-plugin/dist/codex-capture.mjs';
const LEGACY_COMMAND = 'node /Users/x/.codex/hooks/kfdb-codex-hook.mjs';

/** A config.toml fragment shaped like the live reference (5 events, some with matchers). */
function wiredConfig(command: string): string {
  return [
    '[features]',
    'plugin_hooks = true',
    'codex_hooks = true',
    '',
    '[[hooks.UserPromptSubmit]]',
    '[[hooks.UserPromptSubmit.hooks]]',
    'type = "command"',
    `command = "${command}"`,
    'timeout = 10',
    '',
    '[[hooks.PreToolUse]]',
    'matcher = "*"',
    '[[hooks.PreToolUse.hooks]]',
    'type = "command"',
    `command = "${command}"`,
    'timeout = 10',
    '',
    '[[hooks.PermissionRequest]]',
    'matcher = "*"',
    '[[hooks.PermissionRequest.hooks]]',
    'type = "command"',
    `command = "${command}"`,
    'timeout = 10',
    '',
    '[[hooks.PostToolUse]]',
    'matcher = "*"',
    '[[hooks.PostToolUse.hooks]]',
    'type = "command"',
    `command = "${command}"`,
    'timeout = 10',
    '',
    '[[hooks.Stop]]',
    '[[hooks.Stop.hooks]]',
    'type = "command"',
    `command = "${command}"`,
    'timeout = 10',
    '',
    '[hooks.state]',
    '',
    '[hooks.state."/Users/x/.codex/config.toml:stop:0:0"]',
    'trusted_hash = "sha256:deadbeef"',
    '',
  ].join('\n');
}

describe('analyzeWiring', () => {
  it('reports fullyWired when every event already points at codex-capture.mjs', () => {
    const status = analyzeWiring(wiredConfig(NEW_COMMAND));
    expect(status.fullyWired).toBe(true);
    expect(status.wiredEvents).toEqual([...CODEX_HOOK_EVENTS]);
    expect(status.legacyEvents).toEqual([]);
    expect(status.missingEvents).toEqual([]);
  });

  it('reports legacy events when command lines reference kfdb-codex-hook.mjs', () => {
    const status = analyzeWiring(wiredConfig(LEGACY_COMMAND));
    expect(status.fullyWired).toBe(false);
    expect(status.legacyEvents).toEqual([...CODEX_HOOK_EVENTS]);
    expect(status.wiredEvents).toEqual([]);
    expect(status.missingEvents).toEqual([]);
  });

  it('reports missingEvents for a file with no hooks section at all', () => {
    const status = analyzeWiring('[features]\nplugin_hooks = true\n');
    expect(status.hasAnyHooksSection).toBe(false);
    expect(status.fullyWired).toBe(false);
    expect(status.wiredEvents).toEqual([]);
    expect(status.legacyEvents).toEqual([]);
    expect(status.missingEvents).toEqual([...CODEX_HOOK_EVENTS]);
  });

  it('handles a mixed file: some wired, some legacy, some missing', () => {
    const mixed = [
      '[[hooks.UserPromptSubmit]]',
      '[[hooks.UserPromptSubmit.hooks]]',
      'type = "command"',
      `command = "${NEW_COMMAND}"`,
      'timeout = 10',
      '',
      '[[hooks.Stop]]',
      '[[hooks.Stop.hooks]]',
      'type = "command"',
      `command = "${LEGACY_COMMAND}"`,
      'timeout = 10',
      '',
    ].join('\n');
    const status = analyzeWiring(mixed);
    expect(status.wiredEvents).toEqual(['UserPromptSubmit']);
    expect(status.legacyEvents).toEqual(['Stop']);
    expect(status.missingEvents).toEqual(['PreToolUse', 'PermissionRequest', 'PostToolUse']);
    expect(status.fullyWired).toBe(false);
  });

  it('does not misattribute a command line outside any hooks.<Event> block', () => {
    const content = ['[mcp_servers.foo]', `command = "${NEW_COMMAND}"`, ''].join('\n');
    const status = analyzeWiring(content);
    expect(status.wiredEvents).toEqual([]);
    expect(status.missingEvents).toEqual([...CODEX_HOOK_EVENTS]);
  });
});

describe('repointLegacyCommands', () => {
  it('rewrites every legacy command line, preserving indentation and trailing content', () => {
    const { content, changedCount } = repointLegacyCommands(wiredConfig(LEGACY_COMMAND), NEW_COMMAND);
    expect(changedCount).toBe(5);
    expect(content).not.toContain('kfdb-codex-hook.mjs');
    expect(content.match(new RegExp(NEW_COMMAND.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'))?.length).toBe(5);
    // timeout / matcher lines untouched
    expect(content).toContain('timeout = 10');
    expect(content).toContain('matcher = "*"');
  });

  it('is a no-op when there is nothing legacy to repoint', () => {
    const original = wiredConfig(NEW_COMMAND);
    const { content, changedCount } = repointLegacyCommands(original, NEW_COMMAND);
    expect(changedCount).toBe(0);
    expect(content).toBe(original);
  });

  it('leaves unrelated command lines (e.g. mcp_servers) untouched', () => {
    const content = ['[mcp_servers.foo]', 'command = "/usr/bin/foo"', ''].join('\n');
    const result = repointLegacyCommands(content, NEW_COMMAND);
    expect(result.changedCount).toBe(0);
    expect(result.content).toBe(content);
  });
});

describe('buildEventBlock / buildFreshWiringBlock', () => {
  it('includes a matcher line only for the events that carry one', () => {
    expect(buildEventBlock('UserPromptSubmit', NEW_COMMAND)).not.toContain('matcher');
    expect(buildEventBlock('PreToolUse', NEW_COMMAND)).toContain('matcher = "*"');
    expect(buildEventBlock('PermissionRequest', NEW_COMMAND)).toContain('matcher = "*"');
    expect(buildEventBlock('PostToolUse', NEW_COMMAND)).toContain('matcher = "*"');
    expect(buildEventBlock('Stop', NEW_COMMAND)).not.toContain('matcher');
  });

  it('builds a parseable-shape block set for all 5 events', () => {
    const block = buildFreshWiringBlock(NEW_COMMAND);
    for (const event of CODEX_HOOK_EVENTS) {
      expect(block).toContain(`[[hooks.${event}]]`);
      expect(block).toContain(`[[hooks.${event}.hooks]]`);
    }
    expect(block.match(/type = "command"/g)?.length).toBe(5);
    expect(block.match(/timeout = 10/g)?.length).toBe(5);
  });

  it('round-trips through analyzeWiring as fully wired', () => {
    const block = buildFreshWiringBlock(NEW_COMMAND);
    const status = analyzeWiring(block);
    expect(status.fullyWired).toBe(true);
  });
});

describe('appendEventBlocks', () => {
  it('appends only the requested events, tolerating a file with no trailing newline', () => {
    const base = '[features]\nplugin_hooks = true';
    const out = appendEventBlocks(base, ['Stop'], NEW_COMMAND);
    expect(out).toContain('[features]');
    expect(out).toContain('[[hooks.Stop]]');
    expect(out).not.toContain('[[hooks.UserPromptSubmit]]');
  });

  it('is a no-op for an empty event list', () => {
    const base = '[features]\nplugin_hooks = true\n';
    expect(appendEventBlocks(base, [], NEW_COMMAND)).toBe(base);
  });
});

describe('applyWiring', () => {
  it('repoints legacy lines and appends missing events in one pass', () => {
    const mixed = [
      '[[hooks.UserPromptSubmit]]',
      '[[hooks.UserPromptSubmit.hooks]]',
      'type = "command"',
      `command = "${LEGACY_COMMAND}"`,
      'timeout = 10',
      '',
    ].join('\n');
    const result = applyWiring(mixed, NEW_COMMAND);
    expect(result.repointedCount).toBe(1);
    expect(result.appendedEvents).toEqual(['PreToolUse', 'PermissionRequest', 'PostToolUse', 'Stop']);

    const finalStatus = analyzeWiring(result.content);
    expect(finalStatus.fullyWired).toBe(true);
  });

  it('is a no-op content-wise when already fully wired (idempotent)', () => {
    const original = wiredConfig(NEW_COMMAND);
    const result = applyWiring(original, NEW_COMMAND);
    expect(result.repointedCount).toBe(0);
    expect(result.appendedEvents).toEqual([]);
    expect(analyzeWiring(result.content).fullyWired).toBe(true);
  });

  it('builds a fully-wired file from a totally fresh config', () => {
    const fresh = '[features]\nplugin_hooks = true\ncodex_hooks = true\n';
    const result = applyWiring(fresh, NEW_COMMAND);
    expect(result.repointedCount).toBe(0);
    expect(result.appendedEvents).toEqual([...CODEX_HOOK_EVENTS]);
    expect(analyzeWiring(result.content).fullyWired).toBe(true);
  });
});
