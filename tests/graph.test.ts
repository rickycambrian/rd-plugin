import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { transcriptToEvents, parseTranscriptSummary } from '../src/lib/transcript.js';
import { buildTraces, groupTurns } from '../src/lib/trace.js';
import { buildGraphOperations, buildGraphWriteBundle, batchOperations, GRAPH_WRITE_TIMEOUT_MS } from '../src/lib/graph.js';

const FIXTURE = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'transcript-sample.jsonl');
const FAILURE_FIXTURE = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'transcript-failure.jsonl');
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

  it('uses each turn start snapshot and carries start/end provenance through the SDK migration seam', () => {
    const events = [
      {
        sequence: 0, hookEventName: 'UserPromptSubmit', claudeSessionId: 'sess-repos', receivedAt: 1,
        prompt: 'first', repository: { owner: 'o', repository: 'r', fullName: 'o/r', remoteUrl: 'x', commitSha: 'a'.repeat(40) },
        workProvenance: { schemaVersion: 'rickydata.work_provenance.v1', repository: { commitSha: 'a'.repeat(40) }, usage: null },
      },
      {
        sequence: 1, hookEventName: 'Stop', claudeSessionId: 'sess-repos', receivedAt: 2,
        repository: { owner: 'o', repository: 'r', fullName: 'o/r', remoteUrl: 'x', commitSha: 'b'.repeat(40) },
        workProvenance: { schemaVersion: 'rickydata.work_provenance.v1', repository: { commitSha: 'b'.repeat(40) }, terminal: { event: 'Stop', resultCommitSha: 'b'.repeat(40), usage: null }, usage: null },
      },
      {
        sequence: 2, hookEventName: 'UserPromptSubmit', claudeSessionId: 'sess-repos', receivedAt: 3,
        prompt: 'second', repository: { owner: 'o', repository: 'r', fullName: 'o/r', remoteUrl: 'x', commitSha: 'c'.repeat(40) },
        workProvenance: { schemaVersion: 'rickydata.work_provenance.v1', repository: { commitSha: 'c'.repeat(40) }, usage: null },
      },
    ] as any;
    const traces = buildTraces({ walletAddress: WALLET, claudeSessionId: 'sess-repos', events });
    expect(traces.map((trace) => trace.repository?.commitSha)).toEqual(['a'.repeat(40), 'c'.repeat(40)]);
    expect(traces[0].baseRepository?.commitSha).toBe('a'.repeat(40));
    expect(traces[0].resultRepository?.commitSha).toBe('b'.repeat(40));
    expect((traces[0].events[1].hookPayload as any).rickydata_work_provenance.terminal.resultCommitSha).toBe('b'.repeat(40));
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

  it('indexes each turn manifest and preserves Claude Stop-hook assistant text', () => {
    const traces = fixtureTraces();
    const stop = traces[0]?.events.find((event) => event.hookEventName === 'Stop');
    if (!stop) throw new Error('fixture has no Stop event');
    expect(stop.lastAssistantMessage).toBe('Done — corrected the typo in the SQL query.');

    const bundle = buildGraphWriteBundle(WALLET, traces);
    expect(bundle.operations.map((operation) => operation.label)).toContain('SessionArtifactManifest');
    expect(bundle.operations.map((operation) => operation.edge_type)).toContain('HAS_ARTIFACT_MANIFEST');
    const inlineContent = bundle.contentArtifacts.flatMap((artifact) =>
      artifact.value.contractVersion === 'content-artifact/v1' ? [artifact.value.content] : [],
    );
    expect(inlineContent).toContain('Done — corrected the typo in the SQL query.');
    expect(inlineContent.some((content) => content.includes('rickydata.session_artifact_manifest.v1'))).toBe(true);
  });

  it('carries historical tool-failure identity into the immutable turn manifest', () => {
    const events = transcriptToEvents(FAILURE_FIXTURE);
    const traces = buildTraces({ walletAddress: WALLET, claudeSessionId: 'sess-failure', events });
    const bundle = buildGraphWriteBundle(WALLET, traces);
    const manifestContent = bundle.contentArtifacts.flatMap((artifact) =>
      artifact.value.contractVersion === 'content-artifact/v1'
        && artifact.value.content.includes('rickydata.session_artifact_manifest.v1')
        ? [artifact.value.content]
        : [],
    );
    expect(manifestContent).toHaveLength(1);
    const manifest = JSON.parse(manifestContent[0]!) as { entries: Array<{ eventType: string; role: string }> };
    expect(manifest.entries).toContainEqual(expect.objectContaining({
      eventType: 'PostToolUseFailure',
      role: 'tool-response',
    }));
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

describe('GRAPH_WRITE_TIMEOUT_MS', () => {
  it('is 60s — the shared timeout for every graph-write path (writer, codex, drain)', () => {
    // Real 900-op /api/v1/write batches take ~10-20s server-side; a tighter
    // client timeout aborts writes the server completes. The queue drain also
    // replays at this value so it is never shorter than the writer that queued.
    expect(GRAPH_WRITE_TIMEOUT_MS).toBe(60000);
  });
});
