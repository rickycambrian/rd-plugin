import path from 'node:path';
import { readHookInput, resolveClaudeSessionId } from './lib/hook-input.js';
import { loadConfig, resolveSink, shouldTrack } from './lib/config.js';
import { setLogLevel, log } from './lib/log.js';
import { gatherContextPack } from './lib/context-pack.js';
import { getDeriveHeaders, type DeriveHeaders } from './lib/derive.js';
import { mintHomeWalletToken } from './lib/home-auth.js';
import { ownedRepository } from './codex/repo.js';
import { taskContextDescriptor } from './lib/task-context.js';
import { writeAll } from './lib/stdout.js';
import { appendPending, pendingCount } from './lib/pending.js';
import { toPendingEvent } from './lib/event.js';

/**
 * Second context stage: after the real objective is observable, retrieve a
 * bounded task-specific delta and inject it into that prompt. Fail-open and
 * private by construction; the exact rendered delivery is queued as a receipt.
 */
async function main(): Promise<void> {
  const input = await readHookInput();
  const config = loadConfig();
  setLogLevel(config.log_level);
  if (resolveSink(config) === 'off' || !shouldTrack(config, input.cwd)) return;

  const cwd = typeof input.cwd === 'string' ? input.cwd : process.cwd();
  const repo = await ownedRepository(cwd, null);
  const repoId = repo?.repository ?? path.basename(cwd) ?? cwd;
  const descriptor = taskContextDescriptor(input, repoId);
  if (!descriptor) return;

  let deriveHeaders: DeriveHeaders | undefined;
  let homeToken: string | undefined;
  if (config.private_key) {
    try {
      [deriveHeaders, homeToken] = await Promise.all([
        getDeriveHeaders({ apiUrl: config.api_url, apiKey: config.api_key ?? '', privateKey: config.private_key }),
        mintHomeWalletToken(config.private_key),
      ]);
    } catch (err) {
      log('debug', 'task-context derive failed (fail-open)', { error: (err as Error).message });
    }
  }

  // Keep the task hook compatible with both the legacy apiKey/deriveHeaders
  // compiler input and the newer consolidated auth object while deployments
  // roll forward independently.
  const packInput = {
    apiUrl: config.api_url,
    apiKey: config.api_key ?? '',
    deriveHeaders,
    auth: {
      apiKey: config.api_key || undefined,
      privateKey: config.private_key || undefined,
      deriveHeaders,
    },
    query: descriptor.query,
    context: descriptor.context,
    heading: 'Task-specific remembered context (KFDB)',
    timeoutMs: 4_200,
    maxChars: 6_000,
    homeUrl: config.home_url,
    homeToken,
    repoId,
    taskSlug: descriptor.taskSlug,
    homeBudget: 20_000,
  } as unknown as Parameters<typeof gatherContextPack>[0];
  const pack = await gatherContextPack(packInput);
  if (!pack.text) return;

  await writeAll(process.stdout, JSON.stringify({
    hookSpecificOutput: { hookEventName: 'UserPromptSubmit', additionalContext: pack.text },
  }));
  const sessionId = resolveClaudeSessionId(input);
  const repository = repo ? {
    owner: repo.owner, repository: repo.repository, fullName: `${repo.owner}/${repo.repository}`,
    remoteUrl: repo.remoteUrl, branch: repo.branch, commitSha: repo.commitSha, treeHash: repo.treeHash,
    dirty: repo.dirty, dirtyStateHash: repo.dirtyStateHash,
  } : undefined;
  const event = toPendingEvent({ ...input, hook_event_name: 'ContextDelivery' }, pendingCount(sessionId), repository);
  event.contextDelivery = {
    deliveryKey: `user-prompt:${sessionId}:${event.sequence}`,
    ...(pack.packId ? { packId: pack.packId } : {}),
    ...(pack.reproducibilityHash && /^[0-9a-f]{64}$/.test(pack.reproducibilityHash)
      ? { packHash: `sha256:${pack.reproducibilityHash}` as const }
      : {}),
    renderedContent: pack.text,
    interface: 'claude-code-user-prompt',
    coverageStatus: pack.coverageStatus,
    omissions: pack.omissions,
    deliveredAt: new Date().toISOString(),
    policyHash: pack.policyHash,
    selectedManifestHash: pack.selectedManifestHash,
    corpusWatermark: pack.corpusWatermark,
  };
  appendPending(sessionId, event);
  log('info', 'task-context injected', {
    repoId, taskSlug: descriptor.taskSlug, contextSource: pack.source,
    coverageStatus: pack.coverageStatus, reproducibilityHash: pack.reproducibilityHash,
  });
}

main()
  .catch((err) => {
    try { log('debug', 'task-context failed (fail-open)', { error: (err as Error).message }); } catch { /* ignore */ }
  })
  .finally(() => { process.exitCode = 0; });
