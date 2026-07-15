import type { ImmutableContentArtifactWrite } from 'rickydata/kfdb';
import type { RdConfig } from './config.js';
import type { DeriveHeaders } from './derive.js';
import { putJson } from './http.js';
import { enqueue } from './queue.js';
import { log } from './log.js';

export interface ArtifactWriteResult {
  attempted: number;
  persisted: number;
  queued: number;
  ok: boolean;
}

/** Persist exact content before graph references; failures are durably queued. */
export async function writeContentArtifacts(
  config: RdConfig,
  apiKey: string,
  deriveHeaders: DeriveHeaders | undefined,
  artifacts: ImmutableContentArtifactWrite[],
): Promise<ArtifactWriteResult> {
  const unique = [...new Map(artifacts.map((artifact) => [artifact.key, artifact])).values()];
  const url = `${config.api_url.replace(/\/$/, '')}/api/v1/kv`;
  const result: ArtifactWriteResult = { attempted: unique.length, persisted: 0, queued: 0, ok: true };
  for (const artifact of unique) {
    const body = { key: artifact.key, value: artifact.value, if_absent: true };
    const queuedRequest = {
      url,
      method: 'PUT' as const,
      body,
      requiresBearer: true,
      requiresDerive: true,
      dedupeKey: `content-artifact:${artifact.key}`,
    };
    if (!deriveHeaders) {
      enqueue(queuedRequest);
      result.queued += 1;
      result.ok = false;
      continue;
    }
    try {
      const response = await putJson(url, body, { Authorization: `Bearer ${apiKey}`, ...deriveHeaders }, 60_000);
      if (response.ok || response.status === 409) {
        result.persisted += 1;
      } else {
        enqueue(queuedRequest);
        result.queued += 1;
        result.ok = false;
        log('warn', 'content artifact write failed; queued', { key: artifact.key, status: response.status });
      }
    } catch (error) {
      enqueue(queuedRequest);
      result.queued += 1;
      result.ok = false;
      log('warn', 'content artifact write error; queued', { key: artifact.key, error: (error as Error).message });
    }
  }
  return result;
}
