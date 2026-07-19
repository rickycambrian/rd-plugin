import fs from 'node:fs';
import path from 'node:path';
import { LIFECYCLE_DIR, safeName } from './paths.js';

export type LifecycleEngine = 'claude' | 'codex';
export type LifecycleStatus = 'working' | 'input required' | 'completed';

interface LifecycleEvent {
  sequence: number;
  hookEventName: string;
  claudeSessionId?: string;
  codexSessionId?: string;
  receivedAt: number;
  toolName?: string;
}

export interface LifecycleSnapshot {
  version: 1;
  engine: LifecycleEngine;
  sessionId: string;
  hookEventName: string;
  status: LifecycleStatus;
  detail?: string;
  updatedAt: number;
  sequence: number;
}

export function lifecycleSnapshotForEvent(
  engine: LifecycleEngine,
  event: LifecycleEvent,
): LifecycleSnapshot | null {
  const sessionId = engine === 'claude' ? event.claudeSessionId : event.codexSessionId;
  if (!sessionId || sessionId === 'unknown') return null;

  let status: LifecycleStatus;
  let detail: string | undefined;
  switch (event.hookEventName) {
    case 'UserPromptSubmit':
    case 'PostToolUse':
      status = 'working';
      break;
    case 'PreToolUse':
      status = event.toolName === 'AskUserQuestion' ? 'input required' : 'working';
      detail = event.toolName !== 'AskUserQuestion' && event.toolName
        ? `running ${event.toolName}`
        : undefined;
      break;
    case 'PermissionRequest':
    case 'Notification':
      status = 'input required';
      break;
    case 'Stop':
    case 'SessionEnd':
      status = 'completed';
      break;
    default:
      return null;
  }

  return {
    version: 1,
    engine,
    sessionId,
    hookEventName: event.hookEventName,
    status,
    ...(detail ? { detail } : {}),
    updatedAt: event.receivedAt,
    sequence: event.sequence,
  };
}

export function writeLifecycleSnapshot(
  snapshot: LifecycleSnapshot,
  root = LIFECYCLE_DIR,
): string {
  const dir = path.join(root, snapshot.engine);
  const target = path.join(dir, `${safeName(snapshot.sessionId)}.json`);
  fs.mkdirSync(dir, { recursive: true });
  try {
    const current = JSON.parse(fs.readFileSync(target, 'utf8')) as Partial<LifecycleSnapshot>;
    if ((current.updatedAt ?? 0) > snapshot.updatedAt
      || (current.updatedAt === snapshot.updatedAt && (current.sequence ?? -1) > snapshot.sequence)) {
      return target;
    }
  } catch {
    // First event or an interrupted older writer: replace it atomically below.
  }

  const temporary = `${target}.${process.pid}.${snapshot.updatedAt}.${snapshot.sequence}.tmp`;
  try {
    fs.writeFileSync(temporary, `${JSON.stringify(snapshot)}\n`, { mode: 0o600 });
    fs.renameSync(temporary, target);
  } finally {
    try { fs.rmSync(temporary, { force: true }); } catch { /* ignore */ }
  }
  return target;
}
