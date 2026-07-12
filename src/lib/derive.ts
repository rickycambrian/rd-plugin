import crypto from 'node:crypto';
import { secp256k1 } from '@noble/curves/secp256k1';
import { keccak_256 } from '@noble/hashes/sha3';
import { DERIVE_SESSION_FILE } from './paths.js';
import { readJsonFile, writeJsonFileAtomic } from './fsutil.js';

export interface DeriveSession {
  sessionId: string;
  keyHex: string;
  /** Expiry in epoch milliseconds. */
  expiresAtMs: number;
  address: string;
}

export interface DeriveHeaders {
  'X-Wallet-Address': string;
  'X-Derive-Session-Id': string;
  'X-Derive-Key': string;
}

interface Eip712TypedData {
  domain: Record<string, unknown>;
  types: Record<string, Array<{ name: string; type: string }>>;
  primaryType: string;
  message: Record<string, unknown>;
}

function hexToBytes(hex: string): Uint8Array {
  const h = hex.startsWith('0x') ? hex.slice(2) : hex;
  const out = new Uint8Array(h.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(h.slice(i * 2, i * 2 + 2), 16);
  return out;
}

function bytesToHex(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += b.toString(16).padStart(2, '0');
  return s;
}

function concatBytes(...arrays: Uint8Array[]): Uint8Array {
  const total = arrays.reduce((sum, a) => sum + a.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const a of arrays) {
    out.set(a, offset);
    offset += a.length;
  }
  return out;
}

function normalizePrivateKey(privateKey: string): Uint8Array {
  const hex = privateKey.startsWith('0x') ? privateKey.slice(2) : privateKey;
  if (hex.length !== 64 || !/^[0-9a-fA-F]+$/.test(hex)) {
    throw new Error('Invalid private key: expected 64 hex chars');
  }
  return hexToBytes(hex);
}

function toChecksumAddress(addressLower: string): string {
  const addr = addressLower.toLowerCase().replace(/^0x/, '');
  const hash = bytesToHex(keccak_256(new TextEncoder().encode(addr)));
  let result = '0x';
  for (let i = 0; i < addr.length; i++) {
    result += parseInt(hash[i], 16) >= 8 ? addr[i].toUpperCase() : addr[i];
  }
  return result;
}

/** Derive the checksummed wallet address from a secp256k1 private key. */
export function addressFromPrivateKey(privateKey: string): string {
  const priv = normalizePrivateKey(privateKey);
  const pub = secp256k1.getPublicKey(priv, false); // uncompressed 65 bytes
  const hash = keccak_256(pub.slice(1)); // drop 0x04 prefix
  return toChecksumAddress(`0x${bytesToHex(hash.slice(-20))}`);
}

// --- EIP-712 struct hashing (byte-identical to the reference Go/JS impl) ---

function encodeType(typeName: string, types: Eip712TypedData['types']): string {
  const fields = types[typeName];
  if (!fields) return '';
  return `${typeName}(${fields.map((f) => `${f.type} ${f.name}`).join(',')})`;
}

function encodeIntField(value: unknown): Uint8Array {
  const n = BigInt(typeof value === 'string' ? value : Math.floor(Number(value)));
  return hexToBytes(n.toString(16).padStart(64, '0'));
}

function encodeField(fieldType: string, value: unknown, types: Eip712TypedData['types']): Uint8Array {
  switch (fieldType) {
    case 'string':
    case 'bytes':
      return keccak_256(new TextEncoder().encode(String(value)));
    case 'address': {
      const addrBytes = hexToBytes(String(value).replace(/^0x/, ''));
      const padded = new Uint8Array(32);
      padded.set(addrBytes, 32 - addrBytes.length);
      return padded;
    }
    case 'bool': {
      const padded = new Uint8Array(32);
      if (value) padded[31] = 1;
      return padded;
    }
    case 'uint256':
    case 'int256':
      return encodeIntField(value);
    default:
      if (types[fieldType]) return hashStruct(fieldType, value as Record<string, unknown>, types);
      return encodeIntField(value);
  }
}

function hashStruct(typeName: string, data: Record<string, unknown>, types: Eip712TypedData['types']): Uint8Array {
  const typeHash = keccak_256(new TextEncoder().encode(encodeType(typeName, types)));
  const parts: Uint8Array[] = [typeHash];
  const fields = types[typeName];
  if (!fields) throw new Error(`EIP-712 type "${typeName}" not found`);
  for (const field of fields) {
    const val = data[field.name];
    parts.push(val === undefined || val === null ? new Uint8Array(32) : encodeField(field.type, val, types));
  }
  return keccak_256(concatBytes(...parts));
}

/** Sign EIP-712 typed data; returns 0x r||s||v hex (v = 27/28). */
function signEip712(typedData: Eip712TypedData, priv: Uint8Array): string {
  const domainHash = hashStruct('EIP712Domain', typedData.domain, typedData.types);
  const messageHash = hashStruct(typedData.primaryType, typedData.message, typedData.types);
  const raw = new Uint8Array(2 + 32 + 32);
  raw[0] = 0x19;
  raw[1] = 0x01;
  raw.set(domainHash, 2);
  raw.set(messageHash, 34);
  const digest = keccak_256(raw);
  const sig = secp256k1.sign(digest, priv);
  const r = sig.r.toString(16).padStart(64, '0');
  const s = sig.s.toString(16).padStart(64, '0');
  const v = (sig.recovery + 27).toString(16).padStart(2, '0');
  return `0x${r}${s}${v}`;
}

function deriveKeyLocally(signatureHex: string): string {
  const sig = signatureHex.startsWith('0x') ? signatureHex.slice(2) : signatureHex;
  return crypto.createHash('sha256').update(Buffer.from(sig, 'hex')).digest('hex');
}

// --- Shared derive-session cache (~/.rickydata/derive-session.json) ---
// Compatible with BOTH the legacy tracking plugin (snake_case, expires_at in
// seconds) and the codex hooks (camelCase, expiresAt in ms). We read either and
// write a superset so every writer converges on one session per wallet.

function readCache(walletAddress: string, apiUrl: string): DeriveSession | null {
  const raw = readJsonFile<Record<string, unknown> | null>(DERIVE_SESSION_FILE, null);
  if (!raw || typeof raw !== 'object') return null;
  if (raw.error) return null; // error sentinel written by the plugin
  const sessionId = (raw.session_id ?? raw.sessionId) as string | undefined;
  const keyHex = (raw.key_hex ?? raw.keyHex) as string | undefined;
  const address = (raw.address ?? '') as string;
  if (!sessionId || !keyHex) return null;
  if (address && address.toLowerCase() !== walletAddress.toLowerCase()) return null;
  if (typeof raw.api_url === 'string' && raw.api_url && raw.api_url !== apiUrl) return null;
  // expiresAt may be ms (codex) or expires_at seconds (plugin).
  let expiresAtMs = 0;
  if (typeof raw.expiresAt === 'number') expiresAtMs = raw.expiresAt;
  else if (typeof raw.expires_at === 'number') expiresAtMs = raw.expires_at * 1000;
  if (expiresAtMs <= Date.now() + 60_000) return null;
  return { sessionId, keyHex, expiresAtMs, address: address || walletAddress };
}

function writeCache(session: DeriveSession, apiUrl: string): void {
  try {
    writeJsonFileAtomic(DERIVE_SESSION_FILE, {
      // legacy-plugin shape
      session_id: session.sessionId,
      key_hex: session.keyHex,
      expires_at: Math.floor(session.expiresAtMs / 1000),
      address: session.address,
      api_url: apiUrl,
      // codex-hook shape
      sessionId: session.sessionId,
      keyHex: session.keyHex,
      expiresAt: session.expiresAtMs,
    });
  } catch {
    // cache is an optimization; a write failure just forces a re-derive
  }
}

export interface DeriveConfig {
  apiUrl: string;
  apiKey?: string;
  privateKey: string;
}

/**
 * Get (from shared cache) or create an S2D derive session for the config's
 * wallet, then return the three request headers. The signing input is the
 * server-provided EIP-712 typed data signed byte-for-byte, so the derived key
 * is identical for a given wallet across every writer that shares this file.
 */
export async function getDeriveHeaders(config: DeriveConfig): Promise<DeriveHeaders> {
  const walletAddress = addressFromPrivateKey(config.privateKey);
  const cached = readCache(walletAddress, config.apiUrl);
  if (cached) {
    return {
      'X-Wallet-Address': walletAddress,
      'X-Derive-Session-Id': cached.sessionId,
      'X-Derive-Key': cached.keyHex,
    };
  }

  const base = config.apiUrl.replace(/\/$/, '');
  const headers: Record<string, string> = { 'Content-Type': 'application/json', Accept: 'application/json' };
  if (config.apiKey) headers['X-KF-API-Key'] = config.apiKey;

  const challengeRes = await fetch(`${base}/api/v1/auth/derive-challenge`, { method: 'POST', headers });
  if (!challengeRes.ok) {
    throw new Error(`derive-challenge failed: ${challengeRes.status} ${await challengeRes.text()}`);
  }
  const challenge = (await challengeRes.json()) as { challenge_id: string; typed_data: Eip712TypedData | string };
  const typedData: Eip712TypedData =
    typeof challenge.typed_data === 'string' ? JSON.parse(challenge.typed_data) : challenge.typed_data;

  const priv = normalizePrivateKey(config.privateKey);
  const signature = signEip712(typedData, priv);

  const deriveRes = await fetch(`${base}/api/v1/auth/derive-key`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ challenge_id: challenge.challenge_id, signature, address: walletAddress }),
  });
  if (!deriveRes.ok) {
    throw new Error(`derive-key failed: ${deriveRes.status} ${await deriveRes.text()}`);
  }
  const derive = (await deriveRes.json()) as { session_id: string; key_hex?: string; expires_at?: number; wallet_address?: string };

  // Server expires_at is epoch seconds; fall back to a 2h TTL if absent so the
  // shared cache is still usable within a single flush burst.
  const expiresAtMs = derive.expires_at ? Number(derive.expires_at) * 1000 : Date.now() + 2 * 60 * 60 * 1000;
  const session: DeriveSession = {
    sessionId: derive.session_id,
    keyHex: derive.key_hex || deriveKeyLocally(signature),
    expiresAtMs,
    address: derive.wallet_address || walletAddress,
  };
  writeCache(session, config.apiUrl);
  return {
    'X-Wallet-Address': walletAddress,
    'X-Derive-Session-Id': session.sessionId,
    'X-Derive-Key': session.keyHex,
  };
}
