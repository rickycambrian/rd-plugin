import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  lifecycleSnapshotForEvent,
  writeLifecycleSnapshot,
} from '../src/lib/lifecycle.js';

describe('local lifecycle snapshots', () => {
  it('maps hook events to the state the user can act on', () => {
    expect(lifecycleSnapshotForEvent('claude', {
      sequence: 1, hookEventName: 'UserPromptSubmit', claudeSessionId: 's1', receivedAt: 10,
    })?.status).toBe('working');
    expect(lifecycleSnapshotForEvent('claude', {
      sequence: 2, hookEventName: 'PreToolUse', claudeSessionId: 's1', receivedAt: 20,
      toolName: 'AskUserQuestion',
    })?.status).toBe('input required');
    expect(lifecycleSnapshotForEvent('codex', {
      sequence: 3, hookEventName: 'Stop', codexSessionId: 'c1', receivedAt: 30,
    })?.status).toBe('completed');
  });

  it('atomically keeps the newest event for each session', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rd-lifecycle-'));
    const current = lifecycleSnapshotForEvent('claude', {
      sequence: 2, hookEventName: 'PostToolUse', claudeSessionId: 's1', receivedAt: 20,
      toolName: 'Bash',
    })!;
    const stale = lifecycleSnapshotForEvent('claude', {
      sequence: 1, hookEventName: 'PermissionRequest', claudeSessionId: 's1', receivedAt: 10,
    })!;

    const target = writeLifecycleSnapshot(current, root);
    writeLifecycleSnapshot(stale, root);

    expect(JSON.parse(fs.readFileSync(target, 'utf8'))).toEqual(current);
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('captures every Claude PreToolUse event', () => {
    const hooks = JSON.parse(fs.readFileSync(new URL('../hooks/hooks.json', import.meta.url), 'utf8'));
    expect(hooks.hooks.PreToolUse.some((entry: { matcher?: string; hooks?: { command?: string }[] }) =>
      entry.matcher === '*' && entry.hooks?.some((hook) => hook.command?.includes('dist/capture.mjs')),
    )).toBe(true);
  });
});
