import { describe, expect, it } from 'vitest';
import { secp256k1 } from '@noble/curves/secp256k1';
import { keccak_256 } from '@noble/hashes/sha3';
import { addressFromPrivateKey } from '../src/lib/derive.js';
import { buildHomeAuthMessage, mintHomeWalletToken } from '../src/lib/home-auth.js';

function recoverAddress(message: string, signatureHex: string): string {
  const messageBytes = new TextEncoder().encode(message);
  const prefix = new TextEncoder().encode(`\x19Ethereum Signed Message:\n${messageBytes.length}`);
  const joined = new Uint8Array(prefix.length + messageBytes.length);
  joined.set(prefix); joined.set(messageBytes, prefix.length);
  const digest = keccak_256(joined);
  const bytes = Uint8Array.from(Buffer.from(signatureHex.slice(2), 'hex'));
  const signature = secp256k1.Signature.fromCompact(bytes.slice(0, 64)).addRecoveryBit(bytes[64]! - 27);
  const publicKey = signature.recoverPublicKey(digest).toRawBytes(false);
  const hash = keccak_256(publicKey.slice(1));
  return `0x${Buffer.from(hash.slice(-20)).toString('hex')}`;
}

describe('mintHomeWalletToken', () => {
  it('mints a Home-branded EIP-191 scwt token recoverable to the configured wallet', async () => {
    const privateKey = '1'.repeat(64);
    const address = addressFromPrivateKey(privateKey).toLowerCase();
    const token = await mintHomeWalletToken(privateKey, { issuedAt: 1_700_000_000, ttlSeconds: 3600 });
    expect(token.startsWith('scwt_')).toBe(true);
    const payload = JSON.parse(Buffer.from(token.slice(5), 'base64url').toString('utf8')) as {
      address: string; issuedAt: number; expiresAt: number; signature: string;
    };
    expect(payload).toMatchObject({ address, issuedAt: 1_700_000_000, expiresAt: 1_700_003_600 });
    expect(recoverAddress(buildHomeAuthMessage(payload), payload.signature)).toBe(address);
  });
});
