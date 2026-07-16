import crypto from 'node:crypto';
import { secp256k1 } from '@noble/curves/secp256k1';
import { keccak_256 } from '@noble/hashes/sha3';
import { addressFromPrivateKey } from './derive.js';

/**
 * ERC-8128 HTTP Message Signatures (RFC 9421 + EIP-191 wallet signing).
 *
 * KFDB accepts these as priority-1, token-free authentication: the wallet IS
 * the credential, and an unknown wallet is auto-provisioned its own tenant on
 * first request. This is what makes `/rd-setup private_key=0x...` sufficient
 * for a brand-new user — no operator-issued API key required.
 *
 * Wire contract (must stay byte-compatible with the server's
 * `kfdb-api/src/auth/erc8128.rs`):
 *   - Covered components: `@method @path @authority` ONLY. KFDB verifies at the
 *     middleware layer with an empty body slice, so a `content-digest` header
 *     would FAIL verification — never send one.
 *   - Signature base lines: `"component": value\n` per component, then
 *     `"@signature-params": (...)` with NO trailing newline.
 *   - EIP-191 personal_sign over the base bytes; 65-byte r||s||v (v = 27/28),
 *     base64 (standard alphabet) in `Signature: eth=:...:`.
 *   - keyid `erc8128:{chainId}:{address}`; validity window ≤ 120s server-side.
 *   - Nonce is single-use per keyid (server replay guard) — sign fresh headers
 *     for EVERY request, never reuse a pair.
 */

export const ERC8128_LABEL = 'eth';
/** Base mainnet — the only network this platform uses. */
export const ERC8128_CHAIN_ID = 8453;
/** Keep well under the server's 120s max validity (plus 15s skew allowance). */
const VALIDITY_SEC = 90;
const CREATED_BACKDATE_SEC = 5;

export interface Erc8128SignInput {
  method: string;
  /** Absolute request URL; @path and @authority are derived from it. */
  url: string;
  privateKey: string;
  chainId?: number;
  /** Test seams — omit in production use. */
  createdSec?: number;
  nonce?: string;
}

export interface Erc8128Headers {
  'Signature-Input': string;
  Signature: string;
}

/** Build the RFC 9421 signature base string (exported for tests). */
export function buildSignatureBase(input: {
  method: string;
  path: string;
  authority: string;
  created: number;
  expires: number;
  nonce: string;
  keyid: string;
}): string {
  const params = `(@method @path @authority;created=${input.created};expires=${input.expires};nonce="${input.nonce}";keyid="${input.keyid}")`;
  return (
    `"@method": ${input.method.toUpperCase()}\n` +
    `"@path": ${input.path}\n` +
    `"@authority": ${input.authority}\n` +
    `"@signature-params": ${params}`
  );
}

/** EIP-191 personal_sign; returns 65 raw bytes r||s||v with v = 27/28. */
function signEip191(message: Uint8Array, privateKey: string): Uint8Array {
  const hex = privateKey.startsWith('0x') ? privateKey.slice(2) : privateKey;
  const priv = Uint8Array.from(Buffer.from(hex, 'hex'));
  const prefix = new TextEncoder().encode(`\x19Ethereum Signed Message:\n${message.length}`);
  const prefixed = new Uint8Array(prefix.length + message.length);
  prefixed.set(prefix, 0);
  prefixed.set(message, prefix.length);
  const digest = keccak_256(prefixed);
  const sig = secp256k1.sign(digest, priv);
  const out = new Uint8Array(65);
  out.set(sig.toCompactRawBytes(), 0);
  out[64] = sig.recovery + 27;
  return out;
}

/**
 * Sign one HTTP request. Returns the two headers to attach. Each call uses a
 * fresh single-use nonce — callers must sign per request, not per session.
 */
export function signErc8128Request(input: Erc8128SignInput): Erc8128Headers {
  const parsed = new URL(input.url);
  // URL.host matches what Node's fetch sends as the Host header (port included
  // only when non-default), which is what the server reads back as @authority.
  const authority = parsed.host;
  const path = parsed.pathname;
  const created = input.createdSec ?? Math.floor(Date.now() / 1000) - CREATED_BACKDATE_SEC;
  const expires = created + VALIDITY_SEC;
  const nonce = input.nonce ?? crypto.randomBytes(16).toString('hex');
  const chainId = input.chainId ?? ERC8128_CHAIN_ID;
  const keyid = `erc8128:${chainId}:${addressFromPrivateKey(input.privateKey)}`;

  const base = buildSignatureBase({ method: input.method, path, authority, created, expires, nonce, keyid });
  const sigBytes = signEip191(new TextEncoder().encode(base), input.privateKey);
  const sigB64 = Buffer.from(sigBytes).toString('base64');

  return {
    'Signature-Input': `${ERC8128_LABEL}=(@method @path @authority;created=${created};expires=${expires};nonce="${nonce}";keyid="${keyid}")`,
    Signature: `${ERC8128_LABEL}=:${sigB64}:`,
  };
}
