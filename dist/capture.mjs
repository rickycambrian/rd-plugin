// rd-plugin bundled output — do not edit; regenerate via `npm run build`.

// src/capture.ts
import { spawn as spawn2 } from "node:child_process";
import path4 from "node:path";
import { fileURLToPath } from "node:url";

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

// src/lib/work-provenance.ts
var WORK_PROVENANCE_SCHEMA_VERSION = "rickydata.work_provenance.v1";
function str(value) {
  return typeof value === "string" && value.trim() ? value.trim() : void 0;
}
function exactText(value) {
  return typeof value === "string" && value.trim() ? value : void 0;
}
function record(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}
function workProvenanceRefs(input, env = process.env) {
  const nested = { ...record(input.rickydata_work), ...record(input.work_context) };
  const pick = (snake, camel, envName) => str(input[snake]) ?? str(input[camel]) ?? str(nested[snake]) ?? str(nested[camel]) ?? str(env[envName]);
  return {
    sourceIntentRef: pick("source_intent_ref", "sourceIntentRef", "RICKYDATA_SOURCE_INTENT_REF"),
    workContractId: pick("work_contract_id", "workContractId", "RICKYDATA_WORK_CONTRACT_ID"),
    workContractHash: pick("work_contract_hash", "workContractHash", "RICKYDATA_WORK_CONTRACT_HASH"),
    oracleRef: pick("oracle_ref", "oracleRef", "RICKYDATA_ORACLE_REF"),
    workContractNodeId: pick("work_contract_node_id", "workContractNodeId", "RICKYDATA_WORK_CONTRACT_NODE_ID"),
    workContractSchemaVersion: pick("work_contract_schema_version", "workContractSchemaVersion", "RICKYDATA_WORK_CONTRACT_SCHEMA_VERSION")
  };
}
function sdkWorkContractRef(refs) {
  const { workContractId, workContractHash, workContractNodeId, workContractSchemaVersion } = refs;
  if (!workContractId || !workContractHash || !workContractNodeId || !workContractSchemaVersion) return void 0;
  if (!/^sha256:[0-9a-f]{64}$/.test(workContractHash)) return void 0;
  return {
    contractId: workContractId,
    contractHash: workContractHash,
    nodeId: workContractNodeId,
    schemaVersion: workContractSchemaVersion,
    ...refs.sourceIntentRef ? { sourceIntentRef: refs.sourceIntentRef } : {}
  };
}
function buildWorkProvenance(input, sequence, repository, env = process.env) {
  const eventName = str(input.hook_event_name) ?? "Unknown";
  const refs = workProvenanceRefs(input, env);
  const hasRefs = Object.values(refs).some(Boolean);
  const prompt = eventName === "UserPromptSubmit" ? exactText(input.prompt) : void 0;
  const terminal = eventName === "Stop" || eventName === "SessionEnd" ? {
    event: eventName,
    ...repository?.commitSha ? { resultCommitSha: repository.commitSha } : {},
    ...repository?.treeHash ? { resultTreeHash: repository.treeHash } : {},
    usage: null
  } : void 0;
  return {
    schemaVersion: WORK_PROVENANCE_SCHEMA_VERSION,
    ...repository ? { repository } : {},
    ...prompt ? { objective: { text: prompt, observedAt: Date.now(), promptSequence: sequence, ...refs } } : {},
    ...hasRefs ? { refs } : {},
    ...terminal ? { terminal } : {},
    usage: null
  };
}

// src/lib/decision.ts
function stringValue(value) {
  return typeof value === "string" && value.trim() ? value : void 0;
}
function record2(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : void 0;
}
function optionLabels(value) {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (typeof item === "string" && item) return [item];
    const row = record2(item);
    if (!row) return [];
    const label = stringValue(row.label) ?? stringValue(row.value) ?? stringValue(row.type) ?? stringValue(row.name);
    return label ? [label] : [];
  });
}
function answerText(response) {
  if (typeof response === "string") return response;
  const row = record2(response);
  if (!row) return void 0;
  const direct = stringValue(row.answer) ?? stringValue(row.selected) ?? stringValue(row.decision);
  if (direct) return direct;
  const answers = record2(row.answers);
  if (!answers) return void 0;
  const values = Object.values(answers).flatMap((value) => {
    if (typeof value === "string") return [value];
    if (Array.isArray(value)) return value.filter((item) => typeof item === "string");
    return [];
  });
  return values.length > 0 ? values.join("\n") : void 0;
}
function observableDecisionFields(input, toolResponse) {
  const toolName = stringValue(input.tool_name) ?? "";
  if (/askuser|ask_user/i.test(toolName)) {
    const toolInput = record2(input.tool_input);
    const questions = Array.isArray(toolInput?.questions) ? toolInput.questions : [];
    const questionRows = questions.map(record2).filter((row) => Boolean(row));
    const question = questionRows.map((row) => stringValue(row.question)).filter(Boolean).join("\n") || stringValue(toolInput?.question) || "Human input requested";
    const options = questionRows.flatMap((row) => optionLabels(row.options));
    if (options.length === 0) options.push(...optionLabels(toolInput?.options));
    return {
      decisionKind: "ask_user",
      decisionQuestion: question,
      decisionOptions: [...new Set(options)],
      ...answerText(toolResponse) ? { decisionAnswer: answerText(toolResponse) } : {}
    };
  }
  const hookName = stringValue(input.hook_event_name) ?? "";
  const permissionDecision = stringValue(input.permission_decision);
  if (/permission/i.test(hookName) || permissionDecision) {
    const question = stringValue(input.permission_prompt) ?? stringValue(input.question) ?? stringValue(input.reason) ?? `Allow ${toolName || "requested tool"}?`;
    const options = [
      ...optionLabels(input.options),
      ...optionLabels(input.permission_suggestions)
    ];
    return {
      decisionKind: "tool_permission",
      decisionQuestion: question,
      decisionOptions: [...new Set(options)],
      ...permissionDecision ? { decisionAnswer: permissionDecision } : {},
      ...stringValue(input.permission_decision_reason) ? { decisionPolicyRef: stringValue(input.permission_decision_reason) } : {}
    };
  }
  return void 0;
}

// src/lib/event.ts
function str2(value) {
  return typeof value === "string" ? value : void 0;
}
function toPendingEvent(input, sequence, repository) {
  const promptStr = str2(input.prompt);
  const toolResponse = input.tool_response !== void 0 ? input.tool_response : input.tool_output;
  const lastAssistant = input.last_assistant_message;
  const decision = observableDecisionFields(input, toolResponse);
  const provenanceRefs = workProvenanceRefs(input);
  return {
    sequence,
    hookEventName: str2(input.hook_event_name) ?? "Unknown",
    claudeSessionId: str2(input.session_id) ?? "unknown",
    transcriptPath: str2(input.transcript_path),
    cwd: str2(input.cwd),
    model: str2(input.model),
    source: str2(input.source),
    receivedAt: Date.now(),
    prompt: promptStr,
    reason: str2(input.reason),
    stopHookActive: typeof input.stop_hook_active === "boolean" ? input.stop_hook_active : void 0,
    toolName: str2(input.tool_name),
    toolUseId: str2(input.tool_use_id),
    toolInput: input.tool_input,
    toolResponse,
    permissionDecision: str2(input.permission_decision),
    permissionDecisionReason: str2(input.permission_decision_reason),
    lastAssistantMessage: typeof lastAssistant === "string" ? lastAssistant : lastAssistant === null ? null : void 0,
    hookPayload: input,
    ...decision,
    repository,
    workContract: sdkWorkContractRef(provenanceRefs),
    sourceIntentRef: provenanceRefs.sourceIntentRef,
    workProvenance: buildWorkProvenance(input, sequence, repository)
  };
}

// src/lib/pending.ts
import fs from "node:fs";

// src/lib/paths.ts
import os from "node:os";
import path from "node:path";
var DATA_DIR = path.join(os.homedir(), ".rickydata");
var CONFIG_FILE = path.join(DATA_DIR, "config.json");
var DERIVE_SESSION_FILE = path.join(DATA_DIR, "derive-session.json");
var STATE_DIR = path.join(DATA_DIR, "state", "rd-plugin");
var STATE_FILE = path.join(STATE_DIR, "state.json");
var PENDING_DIR = path.join(STATE_DIR, "pending");
var QUEUE_DIR = path.join(DATA_DIR, "queue", "rd-plugin");
var QUEUE_DEAD_DIR = path.join(DATA_DIR, "queue-failed", "rd-plugin");
var LOG_FILE = path.join(DATA_DIR, "logs", "rd-plugin.log");
function pendingFileFor(claudeSessionId) {
  return path.join(PENDING_DIR, `${safeName(claudeSessionId)}.jsonl`);
}
function safeName(value) {
  return String(value || "unknown").replace(/[^A-Za-z0-9_.-]/g, "_").slice(0, 200);
}

// src/lib/pending.ts
function pendingCount(claudeSessionId) {
  try {
    const raw = fs.readFileSync(pendingFileFor(claudeSessionId), "utf8");
    return raw.split("\n").filter((line) => line.trim()).length;
  } catch {
    return 0;
  }
}
function appendPending(claudeSessionId, event) {
  fs.mkdirSync(PENDING_DIR, { recursive: true });
  fs.appendFileSync(pendingFileFor(claudeSessionId), `${JSON.stringify(event)}
`, { mode: 384 });
}

// src/lib/config.ts
import fs2 from "node:fs";
var DEFAULT_API_URL = "http://34.60.37.158";
var DEFAULT_HOME_URL = "https://rickydata-home-2dbp4scmrq-uc.a.run.app";
function readRawConfig() {
  try {
    const parsed = JSON.parse(fs2.readFileSync(CONFIG_FILE, "utf8"));
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}
function asBool(value, fallback) {
  return typeof value === "boolean" ? value : fallback;
}
function asStringArray(value) {
  return Array.isArray(value) ? value.filter((v) => typeof v === "string") : [];
}
function loadConfig() {
  const raw = readRawConfig();
  const private_key = typeof raw.private_key === "string" ? raw.private_key : void 0;
  const api_url = process.env.RICKYDATA_API_URL || typeof raw.api_url === "string" && raw.api_url || DEFAULT_API_URL;
  const home_url = process.env.RICKYDATA_HOME_URL || typeof raw.home_url === "string" && raw.home_url || DEFAULT_HOME_URL;
  return {
    api_url,
    home_url,
    api_key: typeof raw.api_key === "string" ? raw.api_key : void 0,
    private_key,
    // `enabled` is the user kill-switch and defaults on. The "do nothing when
    // there is no usable config" behavior is provided by resolveSink() returning
    // 'off' (which the hooks check first) — NOT by this flag. Defaulting to
    // Boolean(private_key) here would wrongly disable gateway-sink mode, where
    // there is no local private_key but tracking must still run.
    enabled: asBool(raw.enabled, true),
    excluded_directories: asStringArray(raw.excluded_directories),
    sink: raw.sink === "direct" || raw.sink === "gateway" || raw.sink === "off" ? raw.sink : void 0,
    track_messages: asBool(raw.track_messages, true),
    track_files: asBool(raw.track_files, true),
    track_git: asBool(raw.track_git, true),
    log_level: typeof raw.log_level === "string" ? raw.log_level : "info"
  };
}
function resolveSink(config, env = process.env) {
  const fromEnv = env.RICKYDATA_KG_SINK;
  if (fromEnv === "direct" || fromEnv === "gateway" || fromEnv === "off") {
    return fromEnv;
  }
  if (config.sink) {
    return config.sink;
  }
  return config.private_key ? "direct" : "off";
}
function shouldTrack(config, cwd) {
  if (config.enabled === false) return false;
  if (cwd && config.excluded_directories.length > 0) {
    const normalizedCwd = cwd.replace(/\\/g, "/").toLowerCase();
    for (const excluded of config.excluded_directories) {
      const normalizedExcluded = excluded.replace(/\\/g, "/").toLowerCase().replace(/\/+$/, "");
      if (normalizedCwd === normalizedExcluded || normalizedCwd.startsWith(`${normalizedExcluded}/`)) {
        return false;
      }
    }
  }
  return true;
}

// src/lib/log.ts
import fs3 from "node:fs";
import path2 from "node:path";
var LEVELS = { debug: 0, info: 1, warn: 2, error: 3 };
var currentLevel = "info";
function setLogLevel(level) {
  if (level in LEVELS) currentLevel = level;
}
function log(level, message, fields = {}) {
  try {
    if ((LEVELS[level] ?? 1) < (LEVELS[currentLevel] ?? 1)) return;
    const entry = JSON.stringify({ ts: (/* @__PURE__ */ new Date()).toISOString(), level, message, ...fields });
    fs3.mkdirSync(path2.dirname(LOG_FILE), { recursive: true });
    fs3.appendFileSync(LOG_FILE, `${entry}
`, { mode: 384 });
  } catch {
  }
}

// src/lib/cli-help.ts
function wantsHelp(args) {
  return args.includes("--help") || args.includes("-h");
}

// src/codex/repo.ts
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
function git(cwd, args) {
  return new Promise((resolve) => {
    try {
      execFile("git", ["-C", cwd, ...args], { timeout: 5e3 }, (error, stdout) => {
        resolve(error ? "" : String(stdout).trim());
      });
    } catch {
      resolve("");
    }
  });
}
function parseGitHubRemote(remoteUrl) {
  const raw = String(remoteUrl || "").trim().replace(/\/$/, "");
  const scp = /^(?:[^@/]+@)?github\.com:([^/]+)\/([^/]+)$/i.exec(raw);
  if (scp) return { owner: scp[1], repository: scp[2].replace(/\.git$/i, "") };
  try {
    const url = new URL(raw);
    const parts = url.pathname.split("/").filter(Boolean);
    if (url.hostname.toLowerCase() !== "github.com" || parts.length !== 2) return null;
    return { owner: parts[0], repository: parts[1].replace(/\.git$/i, "") };
  } catch {
    return null;
  }
}
async function ownedRepository(cwd, owners) {
  if (!cwd) return null;
  const [remoteUrl, branch, commitSha, treeHash, status] = await Promise.all([
    git(cwd, ["remote", "get-url", "origin"]),
    git(cwd, ["branch", "--show-current"]),
    git(cwd, ["rev-parse", "HEAD"]),
    git(cwd, ["rev-parse", "HEAD^{tree}"]),
    git(cwd, ["status", "--porcelain=v1", "-z", "--untracked-files=all"])
  ]);
  const parsed = parseGitHubRemote(remoteUrl);
  if (!parsed) return null;
  const owner = parsed.owner.toLowerCase();
  if (owners !== null && !owners.includes(owner)) return null;
  return {
    owner,
    repository: parsed.repository,
    fullName: `${owner}/${parsed.repository}`,
    remoteUrl,
    dirty: status.length > 0,
    dirtyStateHash: `sha256:${createHash("sha256").update(status).digest("hex")}`,
    ...branch ? { branch } : {},
    .../^[0-9a-f]{40}$/i.test(commitSha) ? { commitSha: commitSha.toLowerCase() } : {},
    .../^[0-9a-f]{40}$/i.test(treeHash) ? { treeHash: treeHash.toLowerCase() } : {}
  };
}

// src/lib/rickygit-arm.ts
import { spawn } from "node:child_process";
import fs4 from "node:fs";
import os2 from "node:os";
import path3 from "node:path";
function str3(value) {
  return typeof value === "string" && value.trim() ? value.trim() : void 0;
}
function exactText2(value) {
  return typeof value === "string" && value.trim() ? value : void 0;
}
function rickygitArmRequest(input, env = process.env) {
  if (input.hook_event_name !== "UserPromptSubmit") return null;
  const objective = exactText2(input.prompt);
  const sessionId = str3(input.session_id);
  if (!objective || !sessionId) return null;
  const refs = workProvenanceRefs(input, env);
  const packId = str3(input.context_pack_id) ?? str3(input.decision_pack_id) ?? str3(env.RICKYDATA_DECISION_PACK_ID);
  const packHash = str3(input.context_pack_hash) ?? str3(input.decision_pack_hash) ?? str3(env.RICKYDATA_DECISION_PACK_HASH);
  return {
    event: {
      session_id: sessionId,
      ...str3(input.cwd) ? { cwd: str3(input.cwd) } : {},
      source: "startup",
      objective,
      ...str3(input.model) ? { model: str3(input.model) } : {}
    },
    env: {
      RICKYDATA_OBJECTIVE: objective,
      ...refs.sourceIntentRef ? { RICKYDATA_SOURCE_INTENT_REF: refs.sourceIntentRef } : {},
      ...packId && packHash ? {
        RICKYDATA_DECISION_PACK_ID: packId,
        RICKYDATA_DECISION_PACK_HASH: packHash
      } : {}
    }
  };
}
function resolveRickygitSessionStartScript(env = process.env) {
  const candidates = [
    str3(env.RICKYGIT_SESSION_START_SCRIPT),
    path3.join(os2.homedir(), "Documents/github/rickydata_git/scripts/rickygit-session-start.sh")
  ].filter((candidate) => Boolean(candidate));
  return candidates.find((candidate) => fs4.existsSync(candidate));
}
function spawnRickygitArm(input, env = process.env) {
  const request = rickygitArmRequest(input, env);
  const script = resolveRickygitSessionStartScript(env);
  if (!request || !script) return false;
  try {
    const child = spawn("bash", [script], {
      detached: true,
      stdio: ["pipe", "ignore", "ignore"],
      env: { ...env, ...request.env }
    });
    child.stdin.end(JSON.stringify(request.event));
    child.unref();
    return true;
  } catch {
    return false;
  }
}

// src/capture.ts
var USAGE = `usage: node capture.mjs [--spawn-flush] [--final]

Fast per-event hook: append one pending event from the hook JSON on stdin.
Normally invoked by the harness, not run by hand.

  --spawn-flush   spawn a detached flush after appending
  --final         mark the spawned flush as the session's final (SessionEnd)
  -h, --help      show this help and exit
`;
async function main() {
  const args = process.argv.slice(2);
  if (wantsHelp(args)) {
    process.stdout.write(USAGE);
    return;
  }
  const spawnFlush = args.includes("--spawn-flush");
  const final = args.includes("--final");
  const input = await readHookInput();
  const config = loadConfig();
  setLogLevel(config.log_level);
  const sink = resolveSink(config);
  if (sink === "off" || !shouldTrack(config, input.cwd)) {
    return;
  }
  const sessionId = typeof input.session_id === "string" && input.session_id ? input.session_id : "unknown";
  const sequence = pendingCount(sessionId);
  const repo = await ownedRepository(typeof input.cwd === "string" ? input.cwd : void 0, null);
  const repository = repo ? {
    owner: repo.owner,
    repository: repo.repository,
    fullName: `${repo.owner}/${repo.repository}`,
    remoteUrl: repo.remoteUrl,
    branch: repo.branch,
    commitSha: repo.commitSha,
    treeHash: repo.treeHash,
    dirty: repo.dirty,
    dirtyStateHash: repo.dirtyStateHash
  } : void 0;
  const event = toPendingEvent(input, sequence, repository);
  appendPending(sessionId, event);
  spawnRickygitArm(input);
  if (spawnFlush) {
    spawnDetachedFlush(sessionId, final);
  }
}
function spawnDetachedFlush(sessionId, final) {
  try {
    const here = path4.dirname(fileURLToPath(import.meta.url));
    const flushScript = path4.join(here, "flush.mjs");
    const flushArgs = [flushScript, sessionId];
    if (final) flushArgs.push("--final");
    const child = spawn2(process.execPath, flushArgs, {
      detached: true,
      stdio: "ignore",
      env: process.env
    });
    child.unref();
  } catch (err) {
    log("warn", "spawn flush failed", { error: err.message });
  }
}
main().catch((err) => {
  try {
    log("error", "capture failed", { error: err.message });
  } catch {
  }
}).finally(() => process.exit(0));
