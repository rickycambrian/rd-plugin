import { describe, it, expect, beforeEach } from 'vitest';
import { appendPending, readPending, pendingCount, clearPending } from '../src/lib/pending.js';
import { toPendingEvent } from '../src/lib/event.js';
import { computeFingerprint } from '../src/lib/state.js';
import type { HookInput } from '../src/lib/hook-input.js';
import type { OwnedRepository } from '../src/codex/repo.js';

const SID = 'cap-test-session';

beforeEach(() => clearPending(SID));

function hook(overrides: Partial<HookInput>): HookInput {
  return { session_id: SID, hook_event_name: 'PostToolUse', cwd: '/w', ...overrides };
}

describe('toPendingEvent', () => {
  it('maps hook stdin fields into a normalized event', () => {
    const event = toPendingEvent(hook({ hook_event_name: 'UserPromptSubmit', prompt: 'hello' }), 3);
    expect(event.sequence).toBe(3);
    expect(event.hookEventName).toBe('UserPromptSubmit');
    expect(event.claudeSessionId).toBe(SID);
    expect(event.prompt).toBe('hello');
  });

  it('prefers tool_response but falls back to tool_output', () => {
    expect(toPendingEvent(hook({ tool_name: 'Read', tool_output: 'x' }), 0).toolResponse).toBe('x');
    expect(toPendingEvent(hook({ tool_name: 'Read', tool_response: 'y', tool_output: 'x' }), 0).toolResponse).toBe('y');
  });

  it('retains complete observable strings and the exact hook envelope', () => {
    const big = 'a'.repeat(40000);
    const event = toPendingEvent(hook({ hook_event_name: 'UserPromptSubmit', prompt: big }), 0);
    expect(event.prompt).toBe(big);
    expect(event.hookPayload).toEqual(expect.objectContaining({ prompt: big }));
  });

  it('normalizes AskUser and permission decisions with exact displayed options and answers', () => {
    const ask = toPendingEvent(hook({
      tool_name: 'AskUserQuestion', tool_use_id: 'ask-1',
      tool_input: { questions: [{ question: 'Ship?', options: [{ label: 'Yes' }, { label: 'No' }] }] },
      tool_response: { answers: { 'Ship?': 'Yes' } },
    }), 0);
    expect(ask).toMatchObject({
      decisionKind: 'ask_user', decisionQuestion: 'Ship?', decisionOptions: ['Yes', 'No'], decisionAnswer: 'Yes',
    });

    const permission = toPendingEvent(hook({
      hook_event_name: 'PermissionRequest', tool_name: 'Bash', permission_decision: 'allow',
      permission_decision_reason: 'policy:deploy', permission_suggestions: [{ type: 'allow' }, { type: 'deny' }],
    }), 1);
    expect(permission).toMatchObject({
      decisionKind: 'tool_permission', decisionAnswer: 'allow', decisionPolicyRef: 'policy:deploy',
    });
    expect(permission.decisionOptions).toEqual(['allow', 'deny']);
  });

  it('captures a prospective objective boundary before tools and keeps unknown usage null', () => {
    const repository: OwnedRepository = {
      owner: 'rickycambrian', repository: 'rd-plugin', remoteUrl: 'git@github.com:rickycambrian/rd-plugin.git',
      fullName: 'rickycambrian/rd-plugin',
      branch: 'main', commitSha: 'a'.repeat(40), treeHash: 'b'.repeat(40), dirty: true,
      dirtyStateHash: `sha256:${'c'.repeat(64)}`,
    };
    const event = toPendingEvent(hook({
      hook_event_name: 'UserPromptSubmit', prompt: '  Implement the verified contract.  ',
      source_intent_ref: 'operator-request:req-1', work_contract_id: 'wc-1',
      work_contract_hash: `sha256:${'d'.repeat(64)}`, oracle_ref: 'oracle:red-1',
      work_contract_node_id: 'work-contract-node-1', work_contract_schema_version: 'rickydata.work_contract.v1',
    }), 1, repository);

    expect(event.workProvenance).toEqual(expect.objectContaining({
      schemaVersion: 'rickydata.work_provenance.v1',
      repository,
      objective: expect.objectContaining({
        text: '  Implement the verified contract.  ',
        sourceIntentRef: 'operator-request:req-1',
        workContractId: 'wc-1',
        oracleRef: 'oracle:red-1',
      }),
      usage: null,
    }));
    expect(event.hookPayload).not.toHaveProperty('rickydata_work_provenance');
    expect(event.repository?.treeHash).toBe('b'.repeat(40));
    expect(event.workContract).toEqual(expect.objectContaining({
      contractId: 'wc-1', nodeId: 'work-contract-node-1', sourceIntentRef: 'operator-request:req-1',
    }));
    expect(event.sourceIntentRef).toBe('operator-request:req-1');
  });

  it('captures the terminal repository state and leaves unavailable usage unknown', () => {
    const repository: OwnedRepository = {
      owner: 'rickycambrian', repository: 'rd-plugin', remoteUrl: 'https://github.com/rickycambrian/rd-plugin',
      fullName: 'rickycambrian/rd-plugin',
      commitSha: 'e'.repeat(40), treeHash: 'f'.repeat(40), dirty: false,
      dirtyStateHash: `sha256:${'0'.repeat(64)}`,
    };
    const event = toPendingEvent(hook({ hook_event_name: 'Stop' }), 9, repository);
    expect(event.workProvenance?.terminal).toEqual({
      event: 'Stop', resultCommitSha: 'e'.repeat(40), resultTreeHash: 'f'.repeat(40), usage: null,
    });
  });
});

describe('pending log append/read', () => {
  it('appends one JSON line per event and reads them back in order', () => {
    appendPending(SID, toPendingEvent(hook({ hook_event_name: 'UserPromptSubmit', prompt: 'a' }), 0));
    appendPending(SID, toPendingEvent(hook({ tool_name: 'Read' }), 1));
    expect(pendingCount(SID)).toBe(2);
    const events = readPending(SID);
    expect(events.map((e) => e.sequence)).toEqual([0, 1]);
    expect(events[0].prompt).toBe('a');
    expect(events[1].toolName).toBe('Read');
  });

  it('clearPending removes the log', () => {
    appendPending(SID, toPendingEvent(hook({}), 0));
    clearPending(SID);
    expect(pendingCount(SID)).toBe(0);
    expect(readPending(SID)).toEqual([]);
  });
});

describe('computeFingerprint idempotency', () => {
  it('is stable for an identical event set (Stop then SessionEnd double-fire)', () => {
    const events = [
      toPendingEvent(hook({ hook_event_name: 'UserPromptSubmit', prompt: 'a' }), 0),
      toPendingEvent(hook({ tool_name: 'Read', tool_use_id: 't1' }), 1),
    ];
    const a = computeFingerprint(SID, 'direct', events);
    const b = computeFingerprint(SID, 'direct', events);
    expect(a).toBe(b);
  });

  it('changes when a new event arrives', () => {
    const base = [toPendingEvent(hook({ hook_event_name: 'UserPromptSubmit', prompt: 'a' }), 0)];
    const grown = [...base, toPendingEvent(hook({ hook_event_name: 'SessionEnd', reason: 'clear' }), 1)];
    expect(computeFingerprint(SID, 'direct', base)).not.toBe(computeFingerprint(SID, 'direct', grown));
  });

  it('changes when the sink changes', () => {
    const events = [toPendingEvent(hook({ hook_event_name: 'UserPromptSubmit', prompt: 'a' }), 0)];
    expect(computeFingerprint(SID, 'direct', events)).not.toBe(computeFingerprint(SID, 'gateway', events));
  });
});
