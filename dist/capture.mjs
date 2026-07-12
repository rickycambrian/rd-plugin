// rd-plugin bundled output — do not edit; regenerate via `npm run build`.

// src/capture.ts
import { spawn } from "node:child_process";
import path3 from "node:path";
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

// src/lib/event.ts
var MAX_STRING = 32e3;
function truncate(value) {
  return value.length <= MAX_STRING ? value : `${value.slice(0, MAX_STRING)}...[truncated ${value.length - MAX_STRING} chars]`;
}
function str(value) {
  return typeof value === "string" ? value : void 0;
}
function toPendingEvent(input, sequence) {
  const promptStr = str(input.prompt);
  const toolResponse = input.tool_response !== void 0 ? input.tool_response : input.tool_output;
  const lastAssistant = input.last_assistant_message;
  return {
    sequence,
    hookEventName: str(input.hook_event_name) ?? "Unknown",
    claudeSessionId: str(input.session_id) ?? "unknown",
    transcriptPath: str(input.transcript_path),
    cwd: str(input.cwd),
    model: str(input.model),
    source: str(input.source),
    receivedAt: Date.now(),
    prompt: promptStr === void 0 ? void 0 : truncate(promptStr),
    reason: str(input.reason),
    stopHookActive: typeof input.stop_hook_active === "boolean" ? input.stop_hook_active : void 0,
    toolName: str(input.tool_name),
    toolUseId: str(input.tool_use_id),
    toolInput: input.tool_input,
    toolResponse,
    permissionDecision: str(input.permission_decision),
    permissionDecisionReason: str(input.permission_decision_reason),
    lastAssistantMessage: typeof lastAssistant === "string" ? truncate(lastAssistant) : lastAssistant === null ? null : void 0
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
  return {
    api_url,
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
  const event = toPendingEvent(input, sequence);
  appendPending(sessionId, event);
  if (spawnFlush) {
    spawnDetachedFlush(sessionId, final);
  }
}
function spawnDetachedFlush(sessionId, final) {
  try {
    const here = path3.dirname(fileURLToPath(import.meta.url));
    const flushScript = path3.join(here, "flush.mjs");
    const flushArgs = [flushScript, sessionId];
    if (final) flushArgs.push("--final");
    const child = spawn(process.execPath, flushArgs, {
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
