import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  RICKYGIT_PREFLIGHT_DIAGNOSTIC, preflightRickygitArm, rickygitArmRequest, spawnRickygitArm,
} from '../src/lib/rickygit-arm.js';

function capabilityBinary(dir: string, flags: string): string {
  const binary = path.join(dir, 'rickygit');
  fs.writeFileSync(binary, `#!/usr/bin/env bash\nprintf '%s\\n' '${flags}'\n`);
  fs.chmodSync(binary, 0o755);
  return binary;
}

describe('rickygitArmRequest', () => {
  it('passes the exact first prompt and existing provenance refs to the idempotent session adapter', () => {
    const request = rickygitArmRequest({
      hook_event_name: 'UserPromptSubmit', session_id: 'session-1', cwd: '/repo', model: 'claude-opus',
      prompt: '  Implement the prospective oracle.  ', source_intent_ref: 'sha256:intent',
      context_pack_id: 'pack-1', context_pack_hash: `sha256:${'a'.repeat(64)}`,
    });
    expect(request).toEqual({
      event: {
        session_id: 'session-1', cwd: '/repo', source: 'startup',
        objective: '  Implement the prospective oracle.  ', model: 'claude-opus',
      },
      env: {
        RICKYDATA_OBJECTIVE: '  Implement the prospective oracle.  ',
        RICKYDATA_SOURCE_INTENT_REF: 'sha256:intent',
        RICKYDATA_DECISION_PACK_ID: 'pack-1',
        RICKYDATA_DECISION_PACK_HASH: `sha256:${'a'.repeat(64)}`,
      },
    });
  });

  it('does not arm before an exact prompt is observable', () => {
    expect(rickygitArmRequest({ hook_event_name: 'SessionStart', session_id: 's' })).toBeNull();
    expect(rickygitArmRequest({ hook_event_name: 'UserPromptSubmit', prompt: ' ' })).toBeNull();
  });

  it('hands the complete event to the detached adapter without depending on a parent stdin pipe', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rd-plugin-rickygit-arm-'));
    const output = path.join(dir, 'event.json');
    const script = path.join(dir, 'adapter.sh');
    fs.writeFileSync(script, '#!/usr/bin/env bash\ncat > "$RICKYGIT_PROOF_OUTPUT"\n');
    const binary = capabilityBinary(dir, '--source-intent-ref --decision-pack-id --decision-pack-hash');
    const input = {
      hook_event_name: 'UserPromptSubmit', session_id: 'detached-session', cwd: '/repo',
      prompt: '  Exact detached objective.  ',
    };
    expect(spawnRickygitArm(input, {
      ...process.env,
      RICKYGIT_SESSION_START_SCRIPT: script,
      RICKYGIT_PROOF_OUTPUT: output,
      RICKYGIT_BIN: binary,
    })).toEqual({ status: 'started', binary });

    let captured: unknown;
    for (let attempt = 0; attempt < 100 && captured === undefined; attempt += 1) {
      try {
        captured = JSON.parse(fs.readFileSync(output, 'utf8'));
      } catch {
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
    }
    expect(captured).toEqual({
      session_id: 'detached-session', cwd: '/repo', source: 'startup',
      objective: '  Exact detached objective.  ',
    });
  });

  it('rejects a stale configured binary before an adapter can omit supplied pack provenance', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rd-plugin-rickygit-stale-'));
    const binary = capabilityBinary(dir, '--source-intent-ref');
    const request = rickygitArmRequest({
      hook_event_name: 'UserPromptSubmit', session_id: 'stale-session', prompt: 'Exact objective.',
      context_pack_id: 'pack-1', context_pack_hash: `sha256:${'a'.repeat(64)}`,
    })!;
    expect(preflightRickygitArm(request, { ...process.env, RICKYGIT_BIN: binary })).toEqual({
      status: 'rejected',
      binary,
      diagnosticCode: RICKYGIT_PREFLIGHT_DIAGNOSTIC,
      missingFlags: ['--decision-pack-id', '--decision-pack-hash'],
      detail: 'configured rickygit cannot carry required provenance flags: --decision-pack-id, --decision-pack-hash',
    });
  });

  it('accepts a current configured binary that supports every supplied provenance ref', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rd-plugin-rickygit-current-'));
    const binary = capabilityBinary(dir, '--source-intent-ref --decision-pack-id --decision-pack-hash');
    const request = rickygitArmRequest({
      hook_event_name: 'UserPromptSubmit', session_id: 'current-session', prompt: 'Exact objective.',
      source_intent_ref: `sha256:${'b'.repeat(64)}`,
      context_pack_id: 'pack-1', context_pack_hash: `sha256:${'a'.repeat(64)}`,
    })!;
    expect(preflightRickygitArm(request, { ...process.env, RICKYGIT_BIN: binary })).toEqual({
      status: 'ok', binary,
    });
  });
});
