import { describe, it, expect } from 'vitest';
import { addressFromPrivateKey } from '../src/lib/derive.js';

describe('addressFromPrivateKey', () => {
  it('derives the canonical checksummed address for the private key = 1 vector', () => {
    // Standard secp256k1 test vector: privkey 0x01 -> 0x7E5F4552091A69125d5DfCb7b8C2659029395Bdf
    const addr = addressFromPrivateKey('0x0000000000000000000000000000000000000000000000000000000000000001');
    expect(addr).toBe('0x7E5F4552091A69125d5DfCb7b8C2659029395Bdf');
  });

  it('accepts a key without the 0x prefix and is deterministic', () => {
    const a = addressFromPrivateKey('0000000000000000000000000000000000000000000000000000000000000001');
    const b = addressFromPrivateKey('0x0000000000000000000000000000000000000000000000000000000000000001');
    expect(a).toBe(b);
  });

  it('rejects a malformed private key', () => {
    expect(() => addressFromPrivateKey('0xdead')).toThrow();
  });
});
