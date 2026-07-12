import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { transcriptToEvents, parseTranscriptSummary } from '../src/lib/transcript.js';
import { buildTraces, groupTurns } from '../src/lib/trace.js';
import { buildGraphOperations, batchOperations } from '../src/lib/graph.js';

const FIXTURE = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'transcript-sample.jsonl');
const WALLET = '0xb3e6fa9620933ba9a6037f4ff890ec5fad0ba113';

function fixtureTraces() {
  const events = transcriptToEvents(FIXTURE);
  const summary = parseTranscriptSummary(FIXTURE);
  return buildTraces({ walletAddress: WALLET, claudeSessionId: 'sess-abc', events, summary });
}

describe('groupTurns', () => {
  it('opens a new turn at each UserPromptSubmit', () => {
    const events = transcriptToEvents(FIXTURE);
    const groups = groupTurns(events);
    // One prompt in the fixture => one turn holding all following tool/stop events.
    expect(groups.length).toBe(1);
    expect(groups[0].length).toBe(events.length);
  });
});

describe('buildTraces', () => {
  it('attaches transcript enrichment to every trace', () => {
    const traces = fixtureTraces();
    expect(traces.length).toBeGreaterThan(0);
    for (const trace of traces) {
      expect(trace.initialPrompt).toBe('Fix the SQL query in report.py');
      expect(trace.parentSessionId).toBe('prior-xyz');
      expect(trace.filesChanged).toBe(1);
      expect(trace.walletAddress).toBe(WALLET);
      expect(trace.sessionId).toBe('sess-abc');
    }
  });
});

describe('buildGraphOperations', () => {
  const ops = buildGraphOperations(WALLET, fixtureTraces());

  it('emits a ClaudeCodeSession node and the SAME_SESSION link (D6)', () => {
    const labels = ops.filter((o) => o.operation === 'create_node').map((o) => o.label);
    expect(labels).toContain('ClaudeCodeSession');
    expect(labels).toContain('HarnessSessionKey');
    const edgeTypes = ops.filter((o) => o.operation === 'create_edge').map((o) => o.edge_type);
    expect(edgeTypes).toContain('SAME_SESSION');
  });

  it('shared code nodes OMIT source entirely (encrypted-KG convergence gotcha)', () => {
    const shared = ops.filter(
      (o) => o.operation === 'create_node' && ['CodeFile', 'CodeCommand', 'CodeWorkspace'].includes(o.label as string),
    );
    expect(shared.length).toBeGreaterThan(0);
    for (const node of shared) {
      const props = (node.properties ?? {}) as Record<string, unknown>;
      expect(Object.prototype.hasOwnProperty.call(props, 'source')).toBe(false);
    }
  });
});

describe('batchOperations', () => {
  it('splits into batches of at most 900 ops', () => {
    const fake = Array.from({ length: 2001 }, (_, i) => ({ operation: 'create_node', id: String(i) }));
    const batches = batchOperations(fake);
    expect(batches.length).toBe(3);
    expect(batches[0].length).toBe(900);
    expect(batches[1].length).toBe(900);
    expect(batches[2].length).toBe(201);
    expect(batches.every((b) => b.length <= 900)).toBe(true);
  });
});
