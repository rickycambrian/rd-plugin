import { describe, expect, it } from 'vitest';
import { rickygitArmRequest } from '../src/lib/rickygit-arm.js';

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
});
