import type { DeriveHeaders } from './derive.js';
import type { RdConfig } from './config.js';
import { signErc8128Request } from './erc8128.js';

/**
 * KFDB request authentication context. Exactly one of two modes:
 *   - api_key present  → `Authorization: Bearer` (unchanged legacy behavior);
 *   - private_key only → ERC-8128 wallet-signed headers, computed fresh per
 *     request (single-use nonce, method/path-bound).
 * S2D derive headers ride along in both modes — they select the encrypted
 * private layer; the mode above is what *authenticates* the request.
 */
export interface KfdbAuth {
  apiKey?: string;
  privateKey?: string;
  deriveHeaders?: DeriveHeaders;
}

export function kfdbAuthFromConfig(config: RdConfig, deriveHeaders?: DeriveHeaders): KfdbAuth {
  return {
    apiKey: config.api_key || undefined,
    privateKey: config.private_key || undefined,
    deriveHeaders,
  };
}

/** True when the context can authenticate a KFDB request at all. */
export function hasKfdbCredential(auth: KfdbAuth): boolean {
  return Boolean(auth.apiKey || auth.privateKey);
}

/**
 * Build auth headers for one request. Bearer mode returns the same headers as
 * before (byte-identical for api_key users). ERC-8128 mode signs this exact
 * method+url — the result is valid for ~90s and its nonce is single-use, so
 * never cache or reuse the returned object across requests.
 */
export function kfdbAuthHeaders(auth: KfdbAuth, method: string, url: string): Record<string, string> {
  const headers: Record<string, string> = auth.deriveHeaders ? { ...auth.deriveHeaders } : {};
  if (auth.apiKey) {
    headers.Authorization = `Bearer ${auth.apiKey}`;
  } else if (auth.privateKey) {
    Object.assign(headers, signErc8128Request({ method, url, privateKey: auth.privateKey }));
  }
  return headers;
}
