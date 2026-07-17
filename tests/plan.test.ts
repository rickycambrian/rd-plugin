import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildClaudeCodeHookTraceWriteBundle, type ClaudeCodeHookTrace } from 'rickydata/kfdb';
import { parseTranscriptSummary } from '../src/lib/transcript.js';
import { buildPlanOperations, buildSessionStubOperation, planNodeId } from '../src/lib/plan.js';

const PLAN_FIXTURE = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'transcript-plan.jsonl');
const PLAN_PATH = '/Users/u/.claude/plans/witty-widget.md';

describe('plan extraction from transcripts', () => {
  const summary = parseTranscriptSummary(PLAN_FIXTURE);

  it('links the plan file from the plan_mode attachment', () => {
    expect(summary.plans).toHaveLength(1);
    expect(summary.plans?.[0].planFilePath).toBe(PLAN_PATH);
  });

  it('prefers the last full body (ExitPlanMode over the earlier Write)', () => {
    expect(summary.plans?.[0].content).toBe('# Plan v2 final');
    expect(summary.plans?.[0].updatedAt).toBe(Date.parse('2026-07-01T10:03:00.000Z'));
  });

  it('still counts the plan file among changed files', () => {
    expect(summary.filesChanged).toBe(2);
  });
});

describe('buildPlanOperations', () => {
  const plans = [{ planFilePath: PLAN_PATH, content: '# Plan v2 final', updatedAt: 1751364180000 }];
  const ops = buildPlanOperations(plans, 'session-node-id');

  it('emits Plan node + HAS_PLAN edge + CodeFile node + PLAN_FILE edge', () => {
    expect(ops.map((o) => (o.label as string) ?? (o.edge_type as string))).toEqual([
      'Plan',
      'HAS_PLAN',
      'CodeFile',
      'PLAN_FILE',
    ]);
  });

  it('stores the markdown, slug, and hashes on the Plan node (merge mode)', () => {
    const node = ops[0] as { mode: string; properties: Record<string, { String?: string; Integer?: number }> };
    expect(node.mode).toBe('merge');
    expect(node.properties.content.String).toBe('# Plan v2 final');
    expect(node.properties.slug.String).toBe('witty-widget');
    expect(node.properties.path.String).toBe(PLAN_PATH);
    expect(node.properties.content_length.Integer).toBe(15);
  });

  it('is deterministic: same path always yields the same Plan node id', () => {
    expect(planNodeId(plans[0])).toBe(ops[0].id);
    expect(planNodeId({ planFilePath: PLAN_PATH })).toBe(ops[0].id);
  });

  it('omits the HAS_PLAN edge when no session node is given (plans-dir sweep)', () => {
    const sweepOps = buildPlanOperations(plans);
    expect(sweepOps.some((o) => o.edge_type === 'HAS_PLAN')).toBe(false);
    expect(sweepOps[0].id).toBe(ops[0].id);
  });

  it('supports pathless plans keyed by content hash', () => {
    const pathless = buildPlanOperations([{ content: 'inline plan' }], 'session-node-id');
    expect(pathless.map((o) => (o.label as string) ?? (o.edge_type as string))).toEqual(['Plan', 'HAS_PLAN']);
  });

  it('mints the exact CodeFile node id the SDK mints for the same path', () => {
    const trace: ClaudeCodeHookTrace = {
      walletAddress: '0xabc',
      agentId: 'claude-code',
      sessionId: 's1',
      turnIndex: 1,
      claudeSessionId: 's1',
      startedAt: 0,
      completedAt: 0,
      events: [
        {
          sequence: 0,
          claudeSessionId: 's1',
          receivedAt: 0,
          hookEventName: 'PostToolUse',
          toolName: 'Write',
          toolInput: { file_path: PLAN_PATH },
        },
      ],
    };
    const sdkCodeFile = buildClaudeCodeHookTraceWriteBundle(trace).operations.find(
      (o) => (o as { label?: string }).label === 'CodeFile',
    ) as { id: string };
    const ourCodeFile = ops.find((o) => o.label === 'CodeFile') as { id: string };
    expect(ourCodeFile.id).toBe(sdkCodeFile.id);
  });
});

describe('buildSessionStubOperation', () => {
  it('emits a merge-mode ClaudeCodeSession stub', () => {
    const op = buildSessionStubOperation('node-1', '0xAbC', 'claude-code', 'sess-1') as {
      label: string;
      mode: string;
      properties: Record<string, { String?: string }>;
    };
    expect(op.label).toBe('ClaudeCodeSession');
    expect(op.mode).toBe('merge');
    expect(op.properties.wallet_address.String).toBe('0xabc');
    expect(op.properties.claude_session_id.String).toBe('sess-1');
  });
});
