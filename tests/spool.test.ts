import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { transcriptToEvents, parseTranscriptSummary } from '../src/lib/transcript.js';
import { buildTraces } from '../src/lib/trace.js';
import { writeSpool, spoolFileName } from '../src/lib/spool.js';
import { buildGraphOperations } from '../src/lib/graph.js';
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
  it('writes one file per trace with spoolVersion:2 and the trace body', () => {
    const dir = tmp();
    const traces = fixtureTraces();
    const written = writeSpool(dir, traces);
    expect(written.length).toBe(traces.length);

    const body = JSON.parse(fs.readFileSync(written[0], 'utf8'));
    expect(body.spoolVersion).toBe(2);
    expect(body.walletAddress).toBe(WALLET);
    expect(body.claudeSessionId).toBe('sess-abc');
    expect(Array.isArray(body.events)).toBe(true);
    expect(Array.isArray(body.graphOperations)).toBe(true);
  });

  it('embeds graphOperations identical to what the direct sink would write', () => {
    const dir = tmp();
    const traces = fixtureTraces();
    const written = writeSpool(dir, traces);

    for (let i = 0; i < traces.length; i++) {
      const body = JSON.parse(fs.readFileSync(written[i], 'utf8'));
      const trace = traces[i];

      // Deep-equal to the exact direct-sink graph ops for this same trace.
      const expected = buildGraphOperations(trace.walletAddress, [trace]);
      expect(body.graphOperations).toEqual(expected);

      // Only create_node / create_edge ops travel in the spool.
      for (const op of body.graphOperations) {
        expect(['create_node', 'create_edge']).toContain(op.operation);
      }

      // The ClaudeCodeSession node carries the deterministic id remote-proof derives.
      const sessionNode = body.graphOperations.find(
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
      const harnessNode = body.graphOperations.find(
        (op: Record<string, unknown>) => op.operation === 'create_node' && op.label === 'HarnessSessionKey',
      );
      const sameSessionEdge = body.graphOperations.find(
        (op: Record<string, unknown>) => op.operation === 'create_edge' && op.edge_type === 'SAME_SESSION',
      );
      expect(harnessNode).toBeTruthy();
      expect(sameSessionEdge).toBeTruthy();
      expect(sameSessionEdge.from).toBe(sessionNode.id);
      expect(sameSessionEdge.to).toBe(harnessNode.id);
    }
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
