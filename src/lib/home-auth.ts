import { secp256k1 } from '@noble/curves/secp256k1';
import { keccak_256 } from '@noble/hashes/sha3';
import { addressFromPrivateKey } from './derive.js';

const HOME_AUTH_BRAND = 'rickydata-home wallet auth';
const DEFAULT_TTL_SECONDS = 24 * 60 * 60;
const MAX_TTL_SECONDS = 48 * 60 * 60;

export interface HomeAuthClaims {
  address: string;
  issuedAt: number;
  expiresAt: number;
}

function privateKeyBytes(privateKey: string): Uint8Array {
  const hex = privateKey.startsWith('0x') ? privateKey.slice(2) : privateKey;
  if (!/^[0-9a-fA-F]{64}$/.test(hex)) throw new Error('Invalid private key: expected 64 hex chars');
  return Uint8Array.from(Buffer.from(hex, 'hex'));
}

export function buildHomeAuthMessage(claims: HomeAuthClaims): string {
  return [
    HOME_AUTH_BRAND,
    `address: ${claims.address.toLowerCase()}`,
    `issuedAt: ${claims.issuedAt}`,
    `expiresAt: ${claims.expiresAt}`,
  ].join('\n');
}

function signPersonalMessage(privateKey: string, message: string): string {
  const body = new TextEncoder().encode(message);
  const prefix = new TextEncoder().encode(`\x19Ethereum Signed Message:\n${body.length}`);
  const framed = new Uint8Array(prefix.length + body.length);
  framed.set(prefix);
  framed.set(body, prefix.length);
  const signature = secp256k1.sign(keccak_256(framed), privateKeyBytes(privateKey));
  const compact = signature.toCompactRawBytes();
  const out = new Uint8Array(65);
  out.set(compact);
  out[64] = signature.recovery + 27;
  return `0x${Buffer.from(out).toString('hex')}`;
}

/** Mint the stateless wallet bearer accepted by rickydata_home. */
export async function mintHomeWalletToken(
  privateKey: string,
  options: { issuedAt?: number; ttlSeconds?: number } = {},
): Promise<string> {
  const address = addressFromPrivateKey(privateKey).toLowerCase();
  const issuedAt = options.issuedAt ?? Math.floor(Date.now() / 1000);
  const ttl = Math.min(options.ttlSeconds ?? DEFAULT_TTL_SECONDS, MAX_TTL_SECONDS);
  const expiresAt = issuedAt + ttl;
  const signature = signPersonalMessage(privateKey, buildHomeAuthMessage({ address, issuedAt, expiresAt }));
  return `scwt_${Buffer.from(JSON.stringify({ address, issuedAt, expiresAt, signature }), 'utf8').toString('base64url')}`;
}
