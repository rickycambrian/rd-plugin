// rd-plugin bundled output — do not edit; regenerate via `npm run build`.

// src/lib/hook-input.ts
async function readHookInput() {
  const chunks = [];
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const raw = Buffer.concat(chunks).toString("utf8").trim();
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

// src/lib/stdout.ts
async function writeAll(output, text) {
  await new Promise((resolve, reject) => {
    output.write(text, (error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}

// src/lib/cli-help.ts
function wantsHelp(args) {
  return args.includes("--help") || args.includes("-h");
}

// src/lib/ci-wait.ts
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
var POLL_PATTERNS = [
  { cls: "gh-run-watch", re: /gh\s+run\s+watch/ },
  { cls: "gh-run-view", re: /gh\s+run\s+view/ },
  { cls: "gh-run-list", re: /gh\s+run\s+list/ },
  { cls: "gh-pr-checks", re: /gh\s+pr\s+checks/ }
];
function pollClassOf(command) {
  for (const { cls, re } of POLL_PATTERNS) {
    if (re.test(command)) return cls;
  }
  return null;
}
function validateCiWaitPolicy(json) {
  if (typeof json !== "object" || json === null || Array.isArray(json)) return null;
  const r = json;
  const known = /* @__PURE__ */ new Set(["version", "budgetPerSession", "perClassBudget", "guidance"]);
  for (const key of Object.keys(r)) if (!known.has(key)) return null;
  if (r["version"] !== 1) return null;
  const budget = r["budgetPerSession"];
  if (typeof budget !== "number" || !Number.isInteger(budget) || budget < 1) return null;
  const guidance = r["guidance"];
  if (typeof guidance !== "string" || guidance.trim() === "" || guidance.length > 2e3) return null;
  const policy = { version: 1, budgetPerSession: budget, guidance };
  if (r["perClassBudget"] !== void 0) {
    const pcb = r["perClassBudget"];
    if (typeof pcb !== "object" || pcb === null || Array.isArray(pcb)) return null;
    const perClass = {};
    for (const [cls, v] of Object.entries(pcb)) {
      if (typeof v !== "number" || !Number.isInteger(v) || v < 0) return null;
      perClass[cls] = v;
    }
    policy.perClassBudget = perClass;
  }
  return policy;
}
var EMPTY_CI_WAIT_STATE = { polls: 0, perClass: {}, denials: 0 };
function ciWaitDenies(policy, cls, state) {
  if (state.polls === 0) return false;
  if (state.polls >= policy.budgetPerSession) return true;
  const classBudget = policy.perClassBudget?.[cls];
  if (classBudget !== void 0 && (state.perClass[cls] ?? 0) >= classBudget) return true;
  return false;
}
function decideCiWait(command, policy, state) {
  const cls = pollClassOf(command);
  if (!cls) return { action: "allow", cls: null, state };
  if (ciWaitDenies(policy, cls, state)) {
    return { action: "deny", cls, reason: policy.guidance, state: { ...state, denials: state.denials + 1 } };
  }
  return {
    action: "allow",
    cls,
    state: {
      polls: state.polls + 1,
      perClass: { ...state.perClass, [cls]: (state.perClass[cls] ?? 0) + 1 },
      denials: state.denials
    }
  };
}
function ciWaitDir() {
  return process.env["CI_WAIT_DIR"] || path.join(os.homedir(), ".rickydata", "ci-wait");
}
function loadCiWaitPolicy() {
  try {
    const p = process.env["CI_WAIT_POLICY_PATH"] || path.join(ciWaitDir(), "policy.json");
    return validateCiWaitPolicy(JSON.parse(fs.readFileSync(p, "utf8")));
  } catch {
    return null;
  }
}
var safeSessionFile = (sessionId) => {
  if (!/^[A-Za-z0-9._-]{1,128}$/.test(sessionId)) return null;
  return path.join(ciWaitDir(), "state", `${sessionId}.json`);
};
function loadCiWaitState(sessionId) {
  try {
    const p = safeSessionFile(sessionId);
    if (!p) return { ...EMPTY_CI_WAIT_STATE, perClass: {} };
    const raw = JSON.parse(fs.readFileSync(p, "utf8"));
    const polls = typeof raw["polls"] === "number" ? raw["polls"] : 0;
    const denials = typeof raw["denials"] === "number" ? raw["denials"] : 0;
    const perClass = {};
    if (typeof raw["perClass"] === "object" && raw["perClass"] !== null) {
      for (const [k, v] of Object.entries(raw["perClass"])) {
        if (typeof v === "number") perClass[k] = v;
      }
    }
    return { polls, perClass, denials };
  } catch {
    return { polls: 0, perClass: {}, denials: 0 };
  }
}
function saveCiWaitState(sessionId, state) {
  const p = safeSessionFile(sessionId);
  if (!p) return;
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(state));
}
function appendCiWaitDenial(sessionId, cls, state) {
  const line = JSON.stringify({ ts: (/* @__PURE__ */ new Date()).toISOString(), sessionId, cls, polls: state.polls, denials: state.denials });
  fs.mkdirSync(ciWaitDir(), { recursive: true });
  fs.appendFileSync(path.join(ciWaitDir(), "denials.jsonl"), line + "\n");
}

// src/ci-wait-guard.ts
var USAGE = `usage: node ci-wait-guard.mjs

PreToolUse(Bash) hook: enforce the deployed CI-wait policy \u2014 deny CI-status
poll loops (gh run watch/view/list, gh pr checks) beyond the session budget,
feeding the policy's guidance back to the model. Dormant until
~/.rickydata/ci-wait/policy.json exists; CI_WAIT_GUARD=0 kills it; ANY error
fails open (allow, no output).

  -h, --help   show this help and exit
`;
async function main() {
  if (wantsHelp(process.argv.slice(2))) {
    await writeAll(process.stdout, USAGE);
    return;
  }
  if (process.env["CI_WAIT_GUARD"] === "0") return;
  const policy = loadCiWaitPolicy();
  if (!policy) return;
  const input = await readHookInput();
  if (input.tool_name !== "Bash") return;
  const command = typeof input.tool_input === "object" && input.tool_input !== null ? input.tool_input["command"] : void 0;
  if (typeof command !== "string" || command === "") return;
  const sessionId = typeof input.session_id === "string" && input.session_id ? input.session_id : "";
  if (!sessionId) return;
  const decision = decideCiWait(command, policy, loadCiWaitState(sessionId));
  if (decision.cls === null) return;
  try {
    saveCiWaitState(sessionId, decision.state);
  } catch {
    return;
  }
  if (decision.action !== "deny") return;
  try {
    appendCiWaitDenial(sessionId, decision.cls, decision.state);
  } catch {
  }
  await writeAll(
    process.stdout,
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "deny",
        permissionDecisionReason: decision.reason
      }
    })
  );
}
main().catch(() => {
}).finally(() => {
  process.exitCode = 0;
});
