import { execFile } from 'node:child_process';

export interface OwnedRepository {
  owner: string;
  repository: string;
  remoteUrl: string;
  branch?: string;
  commitSha?: string;
}

function git(cwd: string, args: string[]): Promise<string> {
  return new Promise((resolve) => {
    try {
      execFile('git', ['-C', cwd, ...args], { timeout: 5000 }, (error, stdout) => {
        resolve(error ? '' : String(stdout).trim());
      });
    } catch {
      resolve('');
    }
  });
}

/**
 * Parse a GitHub remote URL (scp-style `git@github.com:owner/repo.git` or
 * https `https://github.com/owner/repo`) into { owner, repository }. Returns
 * null for non-GitHub or malformed remotes.
 */
export function parseGitHubRemote(remoteUrl: string): { owner: string; repository: string } | null {
  const raw = String(remoteUrl || '').trim().replace(/\/$/, '');
  const scp = /^(?:[^@/]+@)?github\.com:([^/]+)\/([^/]+)$/i.exec(raw);
  if (scp) return { owner: scp[1], repository: scp[2].replace(/\.git$/i, '') };
  try {
    const url = new URL(raw);
    const parts = url.pathname.split('/').filter(Boolean);
    if (url.hostname.toLowerCase() !== 'github.com' || parts.length !== 2) return null;
    return { owner: parts[0], repository: parts[1].replace(/\.git$/i, '') };
  } catch {
    return null;
  }
}

/**
 * Resolve the GitHub repository for a working directory, or null if the cwd is
 * not a git repo, has no GitHub origin, or (when an `owners` allowlist is set)
 * the origin owner is not in the allowlist. `owners: null` disables the owner
 * gate: any GitHub-remoted repo resolves. Owner comparison is case-insensitive;
 * the returned owner is lowercased.
 */
export async function ownedRepository(cwd: string | undefined, owners: string[] | null): Promise<OwnedRepository | null> {
  if (!cwd) return null;
  const [remoteUrl, branch, commitSha] = await Promise.all([
    git(cwd, ['remote', 'get-url', 'origin']),
    git(cwd, ['branch', '--show-current']),
    git(cwd, ['rev-parse', 'HEAD']),
  ]);
  const parsed = parseGitHubRemote(remoteUrl);
  if (!parsed) return null;
  const owner = parsed.owner.toLowerCase();
  if (owners !== null && !owners.includes(owner)) return null;
  return {
    owner,
    repository: parsed.repository,
    remoteUrl,
    ...(branch ? { branch } : {}),
    ...(/^[0-9a-f]{40}$/i.test(commitSha) ? { commitSha: commitSha.toLowerCase() } : {}),
  };
}
