import { readHookInput } from './lib/hook-input.js';
import { writeAll } from './lib/stdout.js';
import { wantsHelp } from './lib/cli-help.js';
import {
  appendCiWaitDenial,
  decideCiWait,
  loadCiWaitPolicy,
  loadCiWaitState,
  saveCiWaitState,
} from './lib/ci-wait.js';

const USAGE = `usage: node ci-wait-guard.mjs

PreToolUse(Bash) hook: enforce the deployed CI-wait policy — deny CI-status
poll loops (gh run watch/view/list, gh pr checks) beyond the session budget,
feeding the policy's guidance back to the model. Dormant until
~/.rickydata/ci-wait/policy.json exists; CI_WAIT_GUARD=0 kills it; ANY error
fails open (allow, no output).

  -h, --help   show this help and exit
`;

async function main(): Promise<void> {
  if (wantsHelp(process.argv.slice(2))) {
    await writeAll(process.stdout, USAGE);
    return;
  }
  if (process.env['CI_WAIT_GUARD'] === '0') return;
  const policy = loadCiWaitPolicy();
  if (!policy) return; // dormant until armed

  const input = await readHookInput();
  if (input.tool_name !== 'Bash') return;
  const command =
    typeof input.tool_input === 'object' && input.tool_input !== null
      ? (input.tool_input as Record<string, unknown>)['command']
      : undefined;
  if (typeof command !== 'string' || command === '') return;
  const sessionId = typeof input.session_id === 'string' && input.session_id ? input.session_id : '';
  if (!sessionId) return;

  const decision = decideCiWait(command, policy, loadCiWaitState(sessionId));
  if (decision.cls === null) return; // not a poll — stay silent
  try {
    saveCiWaitState(sessionId, decision.state);
  } catch {
    return; // can't track budget → fail open, never deny blind
  }
  if (decision.action !== 'deny') return;
  try {
    appendCiWaitDenial(sessionId, decision.cls, decision.state);
  } catch {
    /* ledger is best-effort; the denial still stands */
  }
  await writeAll(
    process.stdout,
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason: decision.reason,
      },
    }),
  );
}

main()
  .catch(() => {
    /* fail-open */
  })
  .finally(() => {
    process.exitCode = 0;
  });
