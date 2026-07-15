import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { transcriptToEvents, parseTranscriptSummary } from '../src/lib/transcript.js';
import { buildTraces } from '../src/lib/trace.js';
import { writeSpool, spoolFileName } from '../src/lib/spool.js';
import { buildGraphOperations } from '../src/lib/graph.js';
import type { PendingEvent } from '../src/lib/event.js';
import { claudeCodeSessionNodeId } from 'rickydata/kfdb';

const FIXTURE = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'transcript-sample.jsonl');
const WALLET = '0xb3e6fa9620933ba9a6037f4ff890ec5fad0ba113';

const tmpDirs: string[] = [];
function tmp(): string {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'rd-plugin-spool-'));
  tmpDirs.push(d);
  return d;
}
afterEach(() => {
  for (const d of tmpDirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
});

function fixtureTraces() {
  return buildTraces({
    walletAddress: WALLET,
    claudeSessionId: 'sess-abc',
    events: transcriptToEvents(FIXTURE),
    summary: parseTranscriptSummary(FIXTURE),
  });
}

/** A minimal turn's worth of captured events, starting with a UserPromptSubmit. */
function syntheticEvents(prompt: string, sessionId = 'sess-xyz'): PendingEvent[] {
  return [
    { sequence: 0, hookEventName: 'UserPromptSubmit', claudeSessionId: sessionId, receivedAt: 1_700_000_000_000, prompt } as PendingEvent,
    { sequence: 1, hookEventName: 'PostToolUse', claudeSessionId: sessionId, receivedAt: 1_700_000_000_100, toolName: 'Read', toolUseId: 't1', toolInput: { file_path: '/x' }, toolResponse: { success: true } } as PendingEvent,
    { sequence: 2, hookEventName: 'Stop', claudeSessionId: sessionId, receivedAt: 1_700_000_000_200 } as PendingEvent,
  ];
}

function sessionNodeOf(graphOperations: Array<Record<string, unknown>>): Record<string, unknown> {
  const node = graphOperations.find(
    (op) => op.operation === 'create_node' && op.label === 'ClaudeCodeSession',
  );
  if (!node) throw new Error('no ClaudeCodeSession node');
  return node;
}

describe('initial_prompt event fallback (transcript-unavailable parity)', () => {
  it('gateway spool: falls back to the first UserPromptSubmit when no transcript summary', () => {
    const dir = tmp();
    // summary undefined mimics the remote TEE workspace where the transcript JSONL isn't parseable.
    const traces = buildTraces({ walletAddress: WALLET, claudeSessionId: 'sess-xyz', events: syntheticEvents('Fix the flaky test in auth.spec.ts'), summary: undefined });
    const written = writeSpool(dir, traces);
    const body = written
      .map((file) => JSON.parse(fs.readFileSync(file, 'utf8')))
      .find((record) => record.recordType === 'graph_batch');
    const node = sessionNodeOf(body.graphOperations);
    expect((node.properties as Record<string, unknown>).initial_prompt).toEqual({ String: 'Fix the flaky test in auth.spec.ts' });
  });

  it('prefers the transcript-derived initial_prompt over the event fallback', () => {
    const traces = buildTraces({
      walletAddress: WALLET,
      claudeSessionId: 'sess-xyz',
      events: syntheticEvents('EVENT prompt should be ignored'),
      summary: { messageCount: 2, filesChanged: 0, initialPrompt: 'TRANSCRIPT prompt wins' },
    });
    expect(traces[0].initialPrompt).toBe('TRANSCRIPT prompt wins');
  });

  it('omits initial_prompt when the flush unit has no UserPromptSubmit and no transcript', () => {
    const events: PendingEvent[] = [
      { sequence: 0, hookEventName: 'PostToolUse', claudeSessionId: 'sess-xyz', receivedAt: 1_700_000_000_000, toolName: 'Read', toolUseId: 't1', toolInput: {}, toolResponse: {} } as PendingEvent,
      { sequence: 1, hookEventName: 'Stop', claudeSessionId: 'sess-xyz', receivedAt: 1_700_000_000_100 } as PendingEvent,
    ];
    const traces = buildTraces({ walletAddress: WALLET, claudeSessionId: 'sess-xyz', events, summary: undefined });
    expect(traces[0].initialPrompt).toBeUndefined();
  });

  it('trims but does not truncate the complete fallback prompt', () => {
    const long = `  ${'a'.repeat(5000)}  `;
    const traces = buildTraces({ walletAddress: WALLET, claudeSessionId: 'sess-xyz', events: syntheticEvents(long), summary: undefined });
    expect(traces[0].initialPrompt).toBe('a'.repeat(5000));
  });
});

describe('spoolFileName', () => {
  it('follows the trace-<sessionId>-<seq>.json contract', () => {
    expect(spoolFileName('sess-abc', 1)).toBe('trace-sess-abc-1.json');
  });

  it('sanitizes unsafe characters in the session id', () => {
    expect(spoolFileName('a/b c', 0)).toBe('trace-a_b_c-0.json');
  });

  it('suffixes split graph-batch files with -bN (batchIndex > 0 only)', () => {
    expect(spoolFileName('sess-abc', 1, 0)).toBe('trace-sess-abc-1.json');
    expect(spoolFileName('sess-abc', 1, 2)).toBe('trace-sess-abc-1-b2.json');
  });
});

describe('writeSpool', () => {
  it('writes bounded v3 artifact preludes before graph-only records', () => {
    const dir = tmp();
    const traces = fixtureTraces();
    const written = writeSpool(dir, traces);
    const bodies = written.map((file) => JSON.parse(fs.readFileSync(file, 'utf8')));
    const artifacts = bodies.filter((body) => body.recordType === 'content_artifact');
    const graphs = bodies.filter((body) => body.recordType === 'graph_batch');
    expect(artifacts.length).toBeGreaterThan(0);
    expect(graphs).toHaveLength(traces.length);
    expect(bodies.every((body) => body.spoolVersion === 3 && body.walletAddress === WALLET)).toBe(true);
    expect(artifacts.every((body) => body.artifact.ifAbsent === true)).toBe(true);
    expect(graphs.every((body) => Array.isArray(body.graphOperations) && body.events === undefined)).toBe(true);
    expect(written.slice(0, artifacts.length).every((file) => path.basename(file).startsWith('artifact-'))).toBe(true);
  });

  it('embeds graphOperations identical to what the direct sink would write', () => {
    const dir = tmp();
    const traces = fixtureTraces();
    const written = writeSpool(dir, traces);

    const bodies = written.map((file) => JSON.parse(fs.readFileSync(file, 'utf8')));
    for (const trace of traces) {
      const graphBodies = bodies.filter((body) => body.recordType === 'graph_batch' && body.turnIndex === trace.turnIndex);
      expect(graphBodies.length).toBeGreaterThan(0);
      const graphOperations = graphBodies.flatMap((body) => body.graphOperations);

      // Deep-equal to the exact direct-sink graph ops for this same trace.
      const expected = buildGraphOperations(trace.walletAddress, [trace]);
      expect(graphOperations).toEqual(expected);

      // Only create_node / create_edge ops travel in the spool.
      for (const op of graphOperations) {
        expect(['create_node', 'create_edge']).toContain(op.operation);
      }

      // The ClaudeCodeSession node carries the deterministic id remote-proof derives.
      const sessionNode = graphOperations.find(
        (op: Record<string, unknown>) => op.operation === 'create_node' && op.label === 'ClaudeCodeSession',
      );
      expect(sessionNode).toBeTruthy();
      expect(sessionNode.id).toBe(
        claudeCodeSessionNodeId({
          walletAddress: trace.walletAddress,
          agentId: trace.agentId,
          sessionId: trace.sessionId,
          claudeSessionId: trace.claudeSessionId,
        }),
      );

      // D6: a HarnessSessionKey merge node + a SAME_SESSION edge from the session node.
      const harnessNode = graphOperations.find(
        (op: Record<string, unknown>) => op.operation === 'create_node' && op.label === 'HarnessSessionKey',
      );
      const sameSessionEdge = graphOperations.find(
        (op: Record<string, unknown>) => op.operation === 'create_edge' && op.edge_type === 'SAME_SESSION',
      );
      expect(harnessNode).toBeTruthy();
      expect(sameSessionEdge).toBeTruthy();
      expect(sameSessionEdge.from).toBe(sessionNode.id);
      expect(sameSessionEdge.to).toBe(harnessNode.id);
    }
  });

  it('keeps every record below the gateway 2 MiB ceiling under worst-case JSON escaping', () => {
    const dir = tmp();
    const traces = buildTraces({
      walletAddress: WALLET,
      claudeSessionId: 'sess-control-bytes',
      events: syntheticEvents('\0'.repeat(300_000), 'sess-control-bytes'),
      summary: undefined,
    });
    const written = writeSpool(dir, traces);
    expect(written.length).toBeGreaterThan(2);
    for (const file of written) expect(fs.statSync(file).size).toBeLessThanOrEqual(2 * 1024 * 1024);
  });

  it('leaves no .tmp files behind (atomic tmp + rename)', () => {
    const dir = tmp();
    writeSpool(dir, fixtureTraces());
    const leftovers = fs.readdirSync(dir).filter((f) => f.includes('.tmp'));
    expect(leftovers).toEqual([]);
  });

  it('re-flush overwrites deterministically by turnIndex seq', () => {
    const dir = tmp();
    const traces = fixtureTraces();
    writeSpool(dir, traces);
    const first = fs.readdirSync(dir).sort();
    writeSpool(dir, traces);
    const second = fs.readdirSync(dir).sort();
    expect(second).toEqual(first);
  });
});
