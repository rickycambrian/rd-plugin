import { describe, expect, it } from 'vitest';
import { writeAll, type CallbackWritable } from '../src/lib/stdout.js';

describe('writeAll', () => {
  it('does not resolve until a large hook envelope has fully flushed', async () => {
    const chunks: string[] = [];
    let flush!: (error?: Error | null) => void;
    const output: CallbackWritable = {
      write(chunk, callback) {
        chunks.push(chunk);
        flush = callback;
        return false;
      },
    };
    const context = 'complete context\n'.repeat(20_000);
    const envelope = JSON.stringify({ hookSpecificOutput: { additionalContext: context } });
    let settled = false;
    const pending = writeAll(output, envelope).then(() => {
      settled = true;
    });

    await Promise.resolve();
    expect(settled).toBe(false);
    expect(chunks.join('')).toHaveLength(envelope.length);
    expect(JSON.parse(chunks.join('')).hookSpecificOutput.additionalContext).toBe(context);
    flush();
    await pending;
    expect(settled).toBe(true);
  });
});
