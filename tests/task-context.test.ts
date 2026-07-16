import { describe, expect, it } from 'vitest';
import { taskContextDescriptor } from '../src/lib/task-context.js';

describe('taskContextDescriptor', () => {
  it('uses the exact first real prompt and opaque Home/Git refs without fabricating them', () => {
    const descriptor = taskContextDescriptor({
      hook_event_name: 'UserPromptSubmit', prompt: '  Fix the red oracle.  ',
      work_context: { work_contract_id: 'wc-1', source_intent_ref: 'request:1', oracle_ref: 'oracle:1' },
      task_slug: 'roadmap-1',
    }, 'rd-plugin');
    expect(descriptor).toEqual({
      query: '  Fix the red oracle.  ',
      taskSlug: 'roadmap-1',
      context: {
        repo_id: 'rd-plugin', source_intent_ref: 'request:1', work_contract_id: 'wc-1', oracle_ref: 'oracle:1',
      },
    });
  });

  it('returns null for lifecycle events without a real prompt', () => {
    expect(taskContextDescriptor({ hook_event_name: 'SessionStart' }, 'rd-plugin')).toBeNull();
    expect(taskContextDescriptor({ hook_event_name: 'UserPromptSubmit', prompt: '   ' }, 'rd-plugin')).toBeNull();
  });
});
