import { describe, it, expect } from 'vitest';
import { secp256k1 } from '@noble/curves/secp256k1';
import { keccak_256 } from '@noble/hashes/sha3';
import { signErc8128Request, buildSignatureBase, ERC8128_CHAIN_ID } from '../src/lib/erc8128.js';
import { kfdbAuthHeaders, kfdbAuthFromConfig, hasKfdbCredential } from '../src/lib/kfdb-auth.js';
import { addressFromPrivateKey } from '../src/lib/derive.js';
import type { RdConfig } from '../src/lib/config.js';

// Throwaway test-only key (the first valid secp256k1 scalar), never a real wallet.
const TEST_KEY = `0x${'0'.repeat(63)}1`;
const TEST_ADDR = addressFromPrivateKey(TEST_KEY);

/**
 * Mirror of the SERVER's verification (kfdb-api/src/auth/erc8128.rs):
 * parse Signature-Input / Signature, rebuild the signature base from the
 * request, EIP-191-hash it, ecrecover, and return the signer address.
 */
function serverVerify(method: string, url: string, headers: Record<string, string>): string {
  const sigInput = headers['Signature-Input'];
  const sigHeader = headers.Signature;

  // parse_signature_input: label=(components;k=v;...)
  const m = /^([^=]+)=\((.+)\)$/.exec(sigInput);
  if (!m) throw new Error('bad Signature-Input');
  const label = m[1];
  const inner = m[2];
  const semi = inner.indexOf(';');
  const components = inner.slice(0, semi).split(/\s+/);
  const params: Record<string, string> = {};
  for (const kv of inner.slice(semi + 1).split(';')) {
    const [k, v] = kv.split('=');
    params[k] = v.replace(/^"|"$/g, '');
  }

  // validate_timestamps (window sanity — mirrors max_validity_sec=120)
  const validity = Number(params.expires) - Number(params.created);
  if (validity <= 0 || validity > 120) throw new Error(`validity out of range: ${validity}`);
  const nowSec = Math.floor(Date.now() / 1000);
  if (Number(params.created) > nowSec + 15) throw new Error('created in future');
  if (nowSec > Number(params.expires) + 15) throw new Error('expired');

  // build_signature_base — byte-identical reconstruction
  const parsed = new URL(url);
  let base = '';
  for (const c of components) {
    let value: string;
    if (c === '@method') value = method.toUpperCase();
    else if (c === '@path') value = parsed.pathname;
    else if (c === '@authority') value = parsed.host;
    else throw new Error(`unsupported component ${c}`);
    base += `"${c}": ${value}\n`;
  }
  base += `"@signature-params": (${components.join(' ')};created=${params.created};expires=${params.expires};nonce="${params.nonce}";keyid="${params.keyid}")`;

  // parse_signature: label=:base64:
  const sm = new RegExp(`^${label}=:(.+):$`).exec(sigHeader);
  if (!sm) throw new Error('bad Signature header');
  const sigBytes = Buffer.from(sm[1], 'base64');
  if (sigBytes.length !== 65) throw new Error(`signature must be 65 bytes, got ${sigBytes.length}`);

  // verify_eip191_signature: prefix, keccak, ecrecover
  const msg = new TextEncoder().encode(base);
  const prefix = new TextEncoder().encode(`\x19Ethereum Signed Message:\n${msg.length}`);
  const prefixed = new Uint8Array(prefix.length + msg.length);
  prefixed.set(prefix, 0);
  prefixed.set(msg, prefix.length);
  const digest = keccak_256(prefixed);

  const v = sigBytes[64];
  const recovery = v >= 27 ? v - 27 : v;
  const sig = secp256k1.Signature.fromCompact(sigBytes.subarray(0, 64)).addRecoveryBit(recovery);
  const pub = sig.recoverPublicKey(digest).toRawBytes(false);
  const addr = `0x${Buffer.from(keccak_256(pub.slice(1)).slice(-20)).toString('hex')}`;

  // keyid address must match the recovered address (case-insensitive)
  const keyAddr = params.keyid.split(':')[2];
  if (addr.toLowerCase() !== keyAddr.toLowerCase()) throw new Error('address mismatch');
  return addr;
}

describe('ERC-8128 request signing', () => {
  it('round-trips through a byte-exact mirror of the server verifier', () => {
    const url = 'http://34.60.37.158/api/v1/write';
    const headers = signErc8128Request({ method: 'POST', url, privateKey: TEST_KEY });
    const recovered = serverVerify('POST', url, headers as unknown as Record<string, string>);
    expect(recovered.toLowerCase()).toBe(TEST_ADDR.toLowerCase());
  });

  it('binds the signature to method and path (verification fails on mismatch)', () => {
    const url = 'http://34.60.37.158/api/v1/write';
    const headers = signErc8128Request({ method: 'POST', url, privateKey: TEST_KEY }) as unknown as Record<string, string>;
    expect(() => serverVerify('PUT', url, headers)).toThrow('address mismatch');
    expect(() => serverVerify('POST', 'http://34.60.37.158/api/v1/kv', headers)).toThrow('address mismatch');
  });

  it('emits the exact wire format the server parser expects', () => {
    const headers = signErc8128Request({
      method: 'post',
      url: 'http://34.60.37.158/api/v1/kv?x=1',
      privateKey: TEST_KEY,
      createdSec: 1710000000,
      nonce: 'abc123',
    });
    expect(headers['Signature-Input']).toBe(
      `eth=(@method @path @authority;created=1710000000;expires=1710000090;nonce="abc123";keyid="erc8128:${ERC8128_CHAIN_ID}:${TEST_ADDR}")`,
    );
    expect(headers.Signature).toMatch(/^eth=:[A-Za-z0-9+/]+=*:$/);
    // Query string is NOT covered (only @method @path @authority) and the path excludes it.
    expect(headers['Signature-Input']).not.toContain('@query');
    expect(headers['Signature-Input']).not.toContain('content-digest');
  });

  it('uses a fresh nonce per call (server nonces are single-use)', () => {
    const url = 'http://34.60.37.158/api/v1/write';
    const a = signErc8128Request({ method: 'POST', url, privateKey: TEST_KEY });
    const b = signErc8128Request({ method: 'POST', url, privateKey: TEST_KEY });
    expect(a['Signature-Input']).not.toBe(b['Signature-Input']);
  });

  it('signature base matches the documented server format', () => {
    const base = buildSignatureBase({
      method: 'POST', path: '/api/v1/query', authority: '34.60.37.158',
      created: 1710000000, expires: 1710000120, nonce: 'test123',
      keyid: 'erc8128:1:0x1234567890123456789012345678901234567890',
    });
    expect(base).toContain('"@method": POST\n');
    expect(base).toContain('"@path": /api/v1/query\n');
    expect(base).toContain('"@authority": 34.60.37.158\n');
    expect(base).toContain('"@signature-params": (@method @path @authority;created=1710000000;');
    expect(base.endsWith(')')).toBe(true); // no trailing newline after @signature-params
  });
});

describe('kfdbAuthHeaders mode selection', () => {
  const derive = { 'X-Wallet-Address': '0xabc', 'X-Derive-Session-Id': 's', 'X-Derive-Key': 'k' } as const;

  it('api_key present → Bearer + derive + client attribution (X-Client-ID)', () => {
    const headers = kfdbAuthHeaders({ apiKey: 'kf_x', privateKey: TEST_KEY, deriveHeaders: derive }, 'POST', 'http://h/api/v1/write');
    expect(headers).toEqual({ ...derive, Authorization: 'Bearer kf_x', 'X-Client-ID': 'rd-plugin' });
  });

  it('private_key only → ERC-8128 headers + derive, no Authorization', () => {
    const headers = kfdbAuthHeaders({ privateKey: TEST_KEY, deriveHeaders: derive }, 'POST', 'http://h/api/v1/write');
    expect(headers.Authorization).toBeUndefined();
    expect(headers['Signature-Input']).toContain('keyid="erc8128:');
    expect(headers.Signature).toMatch(/^eth=:/);
    expect(headers['X-Derive-Key']).toBe('k');
  });

  it('kfdbAuthFromConfig maps config fields and hasKfdbCredential gates on either', () => {
    const config = { api_key: undefined, private_key: TEST_KEY } as unknown as RdConfig;
    const auth = kfdbAuthFromConfig(config);
    expect(auth.apiKey).toBeUndefined();
    expect(auth.privateKey).toBe(TEST_KEY);
    expect(hasKfdbCredential(auth)).toBe(true);
    expect(hasKfdbCredential({})).toBe(false);
    // empty-string api_key must not produce a "Bearer " header
    expect(kfdbAuthFromConfig({ api_key: '', private_key: TEST_KEY } as unknown as RdConfig).apiKey).toBeUndefined();
  });
});
