#!/usr/bin/env node
/**
 * kql.mjs — shared KQL-over-HTTP helper for the rd-plugin e2e gate.
 *
 * Reads KFDB config from ~/.rickydata/config.json (api_url, api_key) and the
 * sign-to-derive session from ~/.rickydata/derive-session.json (session_id,
 * key_hex, address). Sends read-only KQL to {api_url}/api/v1/kql with Bearer +
 * X-User-API-Key + S2D headers so wallet-scoped (encrypted) nodes are visible.
 *
 * Header evidence: mcp-agent-gateway/src/integrations/kfdb-knowledge-graph.ts:1659-1661
 * (X-Wallet-Address / X-Derive-Session-Id / X-Derive-Key) and
 * mcp-agent-gateway/src/tools/kfdb-code-tools.ts:529 (POST /api/v1/kql { query }).
 *
 * Env overrides: RICKYDATA_API_URL, RICKYDATA_CONFIG_DIR (default ~/.rickydata).
 *
 * Programmatic:
 *   import { kql, loadContext } from './kql.mjs';
 *   const { data } = await kql('MATCH (s:ClaudeCodeSession) RETURN s LIMIT 1');
 *
 * CLI (ad-hoc):
 *   node scripts/e2e/kql.mjs 'MATCH (n) RETURN count(n) AS n'
 */

import { readFileSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const CONFIG_DIR = process.env.RICKYDATA_CONFIG_DIR || join(homedir(), '.rickydata');
const CONFIG_PATH = join(CONFIG_DIR, 'config.json');
const DERIVE_PATH = join(CONFIG_DIR, 'derive-session.json');
const DEFAULT_API_URL = 'http://34.60.37.158';

export function loadContext() {
  const config = existsSync(CONFIG_PATH) ? JSON.parse(readFileSync(CONFIG_PATH, 'utf8')) : {};
  const derive = existsSync(DERIVE_PATH) ? JSON.parse(readFileSync(DERIVE_PATH, 'utf8')) : null;
  const apiUrl = (process.env.RICKYDATA_API_URL || config.api_url || DEFAULT_API_URL).replace(/\/+$/, '');
  return {
    apiUrl,
    apiKey: config.api_key || process.env.RICKYDATA_API_KEY || '',
    // derive-session.json may hold an error sentinel — treat that as "no session".
    derive: derive && !derive.error ? derive : null,
  };
}

/** Escape a JS value into a KQL literal for simple $param substitution. */
function toKqlLiteral(value) {
  if (value === null || value === undefined) return 'null';
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  // strings: single-quote and escape backslash + quote
  return `'${String(value).replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
}

/** Substitute $name tokens in the query with escaped literals from params. */
export function bindParams(query, params = {}) {
  return query.replace(/\$([A-Za-z_][A-Za-z0-9_]*)/g, (match, name) => {
    if (!(name in params)) return match; // leave unknown tokens untouched
    return toKqlLiteral(params[name]);
  });
}

/**
 * KFDB returns type-tagged scalars ({ Integer }, { Float }, { String }, { Boolean },
 * { Null }, { Array }, { Object }). Recursively unwrap into plain JS values so
 * callers can compare directly (e.g. Number(row.schema_version) === 3).
 */
export function unwrapKfdbValue(v) {
  if (v === null || v === undefined) return v;
  if (Array.isArray(v)) return v.map(unwrapKfdbValue);
  if (typeof v === 'object') {
    const keys = Object.keys(v);
    if (keys.length === 1) {
      const tag = keys[0];
      const inner = v[tag];
      switch (tag) {
        case 'Integer': case 'Float': case 'String': case 'Boolean': return inner;
        case 'Null': return null;
        case 'Array': return Array.isArray(inner) ? inner.map(unwrapKfdbValue) : inner;
        case 'Object': return unwrapKfdbRow(inner);
        default: return unwrapKfdbRow(v);
      }
    }
    return unwrapKfdbRow(v);
  }
  return v;
}

function unwrapKfdbRow(row) {
  if (!row || typeof row !== 'object') return row;
  const out = {};
  for (const [k, val] of Object.entries(row)) out[k] = unwrapKfdbValue(val);
  return out;
}

/**
 * Run a read-only KQL query. Returns { data, raw } where data is the rows array.
 * Throws on non-2xx so callers can fail the gate loudly.
 */
export async function kql(query, params = {}, ctx = loadContext()) {
  const bound = bindParams(query, params);
  const headers = { 'Content-Type': 'application/json', 'Accept': 'application/json' };
  if (ctx.apiKey) {
    headers['Authorization'] = `Bearer ${ctx.apiKey}`;
    headers['X-User-API-Key'] = ctx.apiKey;
  }
  if (ctx.derive) {
    headers['X-Wallet-Address'] = ctx.derive.address;
    headers['X-Derive-Session-Id'] = ctx.derive.session_id;
    headers['X-Derive-Key'] = ctx.derive.key_hex;
  }

  const res = await fetch(`${ctx.apiUrl}/api/v1/kql`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ query: bound }),
    signal: AbortSignal.timeout(30_000),
  });

  const text = await res.text();
  if (!res.ok) {
    throw new Error(`KQL ${res.status}: ${text.slice(0, 400)}\n  query: ${bound}`);
  }
  let json;
  try { json = JSON.parse(text); } catch { json = { data: [] }; }
  const rawRows = Array.isArray(json.data) ? json.data : (json.rows || []);
  // Unwrap KFDB type tags so callers get plain JS values; `raw` keeps the original.
  return { data: rawRows.map(unwrapKfdbRow), raw: json };
}

/** Convenience: run a query expected to return a single scalar column. */
export async function kqlScalar(query, params, ctx) {
  const { data } = await kql(query, params, ctx);
  if (data.length === 0) return null;
  const row = data[0];
  const keys = Object.keys(row);
  return keys.length ? row[keys[0]] : null;
}

// CLI entry
if (import.meta.url === `file://${process.argv[1]}`) {
  const query = process.argv[2];
  if (!query) {
    console.error("usage: node scripts/e2e/kql.mjs '<KQL query>'");
    process.exit(2);
  }
  kql(query)
    .then(({ data }) => { console.log(JSON.stringify(data, null, 2)); })
    .catch((err) => { console.error(err.message); process.exit(1); });
}
