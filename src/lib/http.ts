export interface HttpResult {
  ok: boolean;
  status: number;
  text: string;
  json: unknown;
}

/** JSON request with an AbortController timeout. Never throws on HTTP status. */
export async function requestJson(
  url: string,
  body: unknown,
  headers: Record<string, string>,
  timeoutMs = 15000,
  method: 'POST' | 'PUT' = 'POST',
): Promise<HttpResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const text = await response.text();
    let json: unknown = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = null;
    }
    return { ok: response.ok, status: response.status, text, json };
  } finally {
    clearTimeout(timer);
  }
}

export function postJson(
  url: string,
  body: unknown,
  headers: Record<string, string>,
  timeoutMs = 15000,
  method: 'POST' | 'PUT' = 'POST',
): Promise<HttpResult> {
  return requestJson(url, body, headers, timeoutMs, method);
}

export function putJson(url: string, body: unknown, headers: Record<string, string>, timeoutMs = 15000): Promise<HttpResult> {
  return requestJson(url, body, headers, timeoutMs, 'PUT');
}

export async function postForm(
  url: string,
  headers: Record<string, string>,
  timeoutMs = 10000,
): Promise<HttpResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { method: 'POST', headers, signal: controller.signal });
    const text = await response.text();
    let json: unknown = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = null;
    }
    return { ok: response.ok, status: response.status, text, json };
  } finally {
    clearTimeout(timer);
  }
}
