#!/usr/bin/env node
/**
 * kg.mjs — shared private-scope KFDB direct-read helper for the rd-plugin e2e gate.
 *
 * Wallet-scoped (S2D-encrypted) trace nodes are NOT visible via /api/v1/kql —
 * the proven read path is the rickydata SDK's private-scope direct reads
 * (batchGetEntities / listEntities with scope:'private'). This module builds a
 * KFDBClient from ~/.rickydata, establishes the derive session, and exposes the
 * node-id builders + read helpers the proof scripts need. Use kql.mjs only for
 * genuinely global (unencrypted) data.
 *
 * Requires: rickydata@1.11.0 installed at the repo root (import 'rickydata/kfdb').
 * Reference pattern: mcp_deployments_registry/daily_development/2026-04-27/scripts/kg/production-kg-trace-proof.mjs
 *
 * Env overrides:
 *   RICKYDATA_CONFIG_DIR  (default ~/.rickydata)
 *   RICKYDATA_API_URL     (overrides config api_url)
 *   RD_KG_AGENT_ID        (plugin agentId, default 'claude-code')
 */

import { readFileSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import {
  KFDBClient,
  claudeCodeSessionNodeId,
  sessionLinkNodeId,
  HARNESS_SESSION_KEY_LABEL,
} from 'rickydata/kfdb';

const CONFIG_DIR = process.env.RICKYDATA_CONFIG_DIR || join(homedir(), '.rickydata');
const CONFIG_PATH = join(CONFIG_DIR, 'config.json');
const DERIVE_PATH = join(CONFIG_DIR, 'derive-session.json');
const DEFAULT_API_URL = 'http://34.60.37.158';

/** Plugin agentId used in ClaudeCodeSession node ids. Matches the plugin's RD_KG_AGENT_ID default. */
export const KG_AGENT_ID = process.env.RD_KG_AGENT_ID || 'claude-code';
export { HARNESS_SESSION_KEY_LABEL };
export const CLAUDE_CODE_SESSION_LABEL = 'ClaudeCodeSession';

export function loadConfig() {
  const config = existsSync(CONFIG_PATH) ? JSON.parse(readFileSync(CONFIG_PATH, 'utf8')) : {};
  const derive = existsSync(DERIVE_PATH) ? JSON.parse(readFileSync(DERIVE_PATH, 'utf8')) : null;
  return {
    apiUrl: (process.env.RICKYDATA_API_URL || config.api_url || DEFAULT_API_URL).replace(/\/+$/, ''),
    apiKey: config.api_key || process.env.RICKYDATA_API_KEY || '',
    privateKey: config.private_key || '',
    // ignore error sentinels in the derive cache
    derive: derive && !derive.error ? derive : null,
  };
}

/** Unwrap KFDB type-tagged property values ({String}/{Integer}/...) into plain JS. */
export function prop(item, key) {
  if (!item) return undefined;
  const value = item[key] ?? item.properties?.[key];
  if (value === null || value === undefined || typeof value !== 'object') return value;
  if ('String' in value) return value.String;
  if ('Integer' in value) return value.Integer;
  if ('Float' in value) return value.Float;
  if ('Boolean' in value) return value.Boolean;
  if ('Null' in value) return null;
  if ('Array' in value) return value.Array;
  return value;
}

async function tryImportEthers() {
  try {
    return await import('ethers');
  } catch {
    throw new Error(
      'No usable derive-session cache and the autoDerive fallback needs `ethers`, which is not installed. ' +
      'Run a real session (or /rd-setup) first so ~/.rickydata/derive-session.json is populated, or `npm i ethers`.',
    );
  }
}

/** ethers signer helper: strip EIP712Domain and sign typed data (returns hex signature). */
async function signKfdbTypedData(wallet, typedData) {
  const types = { ...(typedData.types || {}) };
  delete types.EIP712Domain;
  return wallet.signTypedData(typedData.domain, types, typedData.message || typedData.value);
}

/**
 * Build a private-scope KFDBClient and establish the derive session.
 * Primary path: reuse the plugin's cached derive session (setDeriveSession).
 * Fallback: autoDerive from config.private_key via ethers.
 * Returns { client, walletAddress, apiUrl }.
 */
export async function makeClient({ scope = 'private' } = {}) {
  const cfg = loadConfig();
  if (!cfg.apiKey) throw new Error('No api_key in ~/.rickydata/config.json (needed for KFDB Bearer auth).');

  const cacheUsable = cfg.derive && cfg.derive.session_id && cfg.derive.key_hex && cfg.derive.address
    && (!cfg.derive.expires_at || Date.now() < cfg.derive.expires_at * 1000 - 60_000);

  let walletAddress = cacheUsable ? cfg.derive.address : null;
  let signer = null;
  if (!walletAddress) {
    if (!cfg.privateKey) {
      throw new Error('No usable derive-session cache and no private_key in ~/.rickydata — run a real session or /rd-setup first.');
    }
    const ethers = await tryImportEthers();
    signer = new ethers.Wallet(cfg.privateKey.startsWith('0x') ? cfg.privateKey : `0x${cfg.privateKey}`);
    walletAddress = signer.address;
  }

  const client = new KFDBClient({ baseUrl: cfg.apiUrl, apiKey: cfg.apiKey, walletAddress, defaultReadScope: scope });

  if (cacheUsable) {
    client.setDeriveSession(cfg.derive.session_id, cfg.derive.key_hex);
  } else {
    const ethers = await tryImportEthers();
    const wallet = signer || new ethers.Wallet(cfg.privateKey.startsWith('0x') ? cfg.privateKey : `0x${cfg.privateKey}`);
    await client.autoDerive((typedData) => signKfdbTypedData(wallet, typedData));
  }

  return { client, walletAddress, apiUrl: cfg.apiUrl };
}

/** Deterministic ClaudeCodeSession node id. Plugin sets trace sessionId = claudeSessionId. */
export function claudeSessionNodeId(walletAddress, claudeSessionId, agentId = KG_AGENT_ID) {
  return claudeCodeSessionNodeId({ walletAddress, agentId, sessionId: claudeSessionId, claudeSessionId });
}

/** Deterministic HarnessSessionKey (D6 merge node) id. */
export function harnessKeyNodeId(walletAddress, claudeSessionId) {
  return sessionLinkNodeId({ walletAddress, claudeSessionId });
}

/**
 * batchGetEntities for known {label,id} refs. Returns a map keyed `${label}:${id}`
 * (null when missing) plus the raw resolved/missing counts.
 */
export async function getKnown(client, refs) {
  const res = await client.batchGetEntities({ scope: 'private', entities: refs });
  const output = {};
  for (const ref of refs) {
    const key = `${ref.label}:${ref.id}`;
    output[key] = res.entities?.[key] || res.entities?.[ref.id] || null;
  }
  return { output, resolved: res.resolved, missing: res.missing, requested: res.requested };
}

/**
 * List a private label and filter to a claude session id (matches
 * claude_session_id or session_id). Paginates via offset — encrypted props
 * can't be filtered server-side, and a single window under-counts once a
 * wallet has more rows of a label than one page (seen live at 1000+
 * RickydataChatSession rows with the old single limit=300 window).
 * `maxRows` bounds the scan; stops early once a match is found.
 */
export async function findBySession(client, label, claudeSessionId, maxRows = 10_000) {
  const pageSize = 300;
  const matches = [];
  for (let offset = 0; offset < maxRows; offset += pageSize) {
    const listed = await client.listEntities(label, { scope: 'private', limit: pageSize, offset });
    const items = listed.items || [];
    for (const item of items) {
      const cs = prop(item, 'claude_session_id');
      const ss = prop(item, 'session_id');
      if (cs === claudeSessionId || ss === claudeSessionId) matches.push(item);
    }
    if (matches.length > 0) break; // existence is what callers need; stop paging
    const total = typeof listed.total === 'number' ? listed.total : Infinity;
    if (items.length < pageSize || offset + pageSize >= total) break;
  }
  return matches;
}

/**
 * SAME_SESSION in-degree for a session's HarnessSessionKey merge node.
 *
 * KFDB exposes no wallet-scoped edge-read API and KQL cannot see encrypted
 * edges, so in-degree is measured by its exact structural equivalent: each
 * writer family emits exactly one SAME_SESSION edge from its own session node
 * into the shared key, so the number of distinct SOURCE session nodes that
 * exist for this (wallet, session) equals the SAME_SESSION in-degree.
 *
 * Source families checked: ClaudeCodeSession (deterministic id), plus any
 * `extraFamilies` (default RickydataChatSession [home], RickydataAgentSession
 * [git]) discovered by private listEntities + claude_session_id filter.
 */
export async function sameSessionInDegree(client, walletAddress, claudeSessionId, opts = {}) {
  const maxRows = opts.limit || 10_000;
  const extraFamilies = opts.extraFamilies || ['RickydataChatSession', 'RickydataAgentSession'];

  const harnessId = harnessKeyNodeId(walletAddress, claudeSessionId);
  const ccId = claudeSessionNodeId(walletAddress, claudeSessionId, opts.agentId);
  const { output } = await getKnown(client, [
    { label: HARNESS_SESSION_KEY_LABEL, id: harnessId },
    { label: CLAUDE_CODE_SESSION_LABEL, id: ccId },
  ]);

  const harnessPresent = !!output[`${HARNESS_SESSION_KEY_LABEL}:${harnessId}`];
  const sources = [];
  if (output[`${CLAUDE_CODE_SESSION_LABEL}:${ccId}`]) sources.push(CLAUDE_CODE_SESSION_LABEL);
  for (const label of extraFamilies) {
    try {
      const found = await findBySession(client, label, claudeSessionId, maxRows);
      if (found.length > 0) sources.push(label);
    } catch {
      // label may not exist in this wallet's graph yet — not an error for in-degree
    }
  }

  return { harnessId, claudeCodeSessionId: ccId, harnessPresent, sources, inDegree: sources.length };
}

// CLI: quick lookup of a session's nodes. `node scripts/e2e/kg.mjs <claudeSessionId>`
if (import.meta.url === `file://${process.argv[1]}`) {
  const sid = process.argv[2];
  if (!sid) { console.error('usage: node scripts/e2e/kg.mjs <claudeSessionId>'); process.exit(2); }
  makeClient()
    .then(async ({ client, walletAddress }) => {
      const ccId = claudeSessionNodeId(walletAddress, sid);
      const harnessId = harnessKeyNodeId(walletAddress, sid);
      const { output } = await getKnown(client, [
        { label: CLAUDE_CODE_SESSION_LABEL, id: ccId },
        { label: HARNESS_SESSION_KEY_LABEL, id: harnessId },
      ]);
      const inDeg = await sameSessionInDegree(client, walletAddress, sid);
      console.log(JSON.stringify({
        walletAddress, claudeSessionId: sid,
        claudeCodeSession: { id: ccId, present: !!output[`${CLAUDE_CODE_SESSION_LABEL}:${ccId}`], schema_version: prop(output[`${CLAUDE_CODE_SESSION_LABEL}:${ccId}`], 'schema_version') },
        harnessSessionKey: { id: harnessId, present: inDeg.harnessPresent },
        sameSession: { inDegree: inDeg.inDegree, sources: inDeg.sources },
      }, null, 2));
    })
    .catch((err) => { console.error(err.message); process.exit(1); });
}
