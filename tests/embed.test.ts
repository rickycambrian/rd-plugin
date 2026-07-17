import { describe, expect, it } from 'vitest';
import { collectEmbedTargets } from '../src/lib/embed.js';

const node = (label: string, id: string, properties: Record<string, unknown>) => ({
  operation: 'create_node',
  id,
  label,
  mode: 'merge',
  properties,
});

describe('collectEmbedTargets', () => {
  it('picks the mapped text property per label and skips everything else', () => {
    const targets = collectEmbedTargets([
      node('Plan', 'p1', { content: { String: '# The plan' } }),
      node('ClaudeCodeSession', 's1', { initial_prompt: { String: 'fix the bug' } }),
      node('CodeCommand', 'c1', { command_preview: { String: 'npm test' } }),
      node('ClaudeCodeToolUse', 't1', { tool_name: { String: 'Bash' } }),
      node('CodeFile', 'f1', { path: { String: '/a/b.ts' } }),
      { operation: 'create_edge', id: 'e1', edge_type: 'HAS_PLAN' },
    ]);
    expect(targets).toEqual([
      { label: 'Plan', node_id: 'p1', text: '# The plan' },
      { label: 'ClaudeCodeSession', node_id: 's1', text: 'fix the bug' },
      { label: 'CodeCommand', node_id: 'c1', text: 'npm test' },
    ]);
  });

  it('dedupes by node id with last op winning, skips empty text, truncates to 30000', () => {
    const targets = collectEmbedTargets([
      node('Plan', 'p1', { content: { String: 'stale' } }),
      node('Plan', 'p1', { content: { String: 'x'.repeat(30001) } }),
      node('Plan', 'p2', { content: { String: '   ' } }),
      node('ClaudeCodeSession', 's1', {}),
    ]);
    expect(targets).toHaveLength(1);
    expect(targets[0].node_id).toBe('p1');
    expect(targets[0].text).toHaveLength(30000);
  });
});
