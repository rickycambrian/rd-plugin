// rd-plugin bundled output — do not edit; regenerate via `npm run build`.

// src/setup.ts
import fs3 from "node:fs";

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

// src/lib/fsutil.ts
import fs from "node:fs";
import path2 from "node:path";
function readJsonFile(filePath, fallback) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return fallback;
  }
}
function writeJsonFileAtomic(filePath, data) {
  fs.mkdirSync(path2.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.tmp.${process.pid}.${Math.random().toString(36).slice(2)}`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), { mode: 384 });
  fs.renameSync(tmp, filePath);
}

// src/lib/log.ts
import fs2 from "node:fs";
import path3 from "node:path";
var LEVELS = { debug: 0, info: 1, warn: 2, error: 3 };
var currentLevel = "info";
function setLogLevel(level) {
  if (level in LEVELS) currentLevel = level;
}
function log(level, message, fields = {}) {
  try {
    if ((LEVELS[level] ?? 1) < (LEVELS[currentLevel] ?? 1)) return;
    const entry = JSON.stringify({ ts: (/* @__PURE__ */ new Date()).toISOString(), level, message, ...fields });
    fs2.mkdirSync(path3.dirname(LOG_FILE), { recursive: true });
    fs2.appendFileSync(LOG_FILE, `${entry}
`, { mode: 384 });
  } catch {
  }
}

// src/lib/setup-core.ts
var STRING_KEYS = /* @__PURE__ */ new Set(["api_url", "api_key", "private_key", "sink", "log_level"]);
var BOOL_KEYS = /* @__PURE__ */ new Set(["enabled", "track_messages", "track_files", "track_git"]);
var LIST_KEYS = /* @__PURE__ */ new Set(["excluded_directories", "codex_repo_owners"]);
var SECRET_KEYS = /* @__PURE__ */ new Set(["api_key", "private_key"]);
var SINK_VALUES = /* @__PURE__ */ new Set(["direct", "gateway", "off"]);
function parseSetupArgs(args) {
  const updates = {};
  const errors = [];
  let force = false;
  for (const arg of args) {
    if (arg === "--force") {
      force = true;
      continue;
    }
    const eq = arg.indexOf("=");
    if (eq <= 0) continue;
    const key = arg.slice(0, eq).replace(/^--/, "").trim();
    const raw = arg.slice(eq + 1);
    if (STRING_KEYS.has(key)) {
      if (key === "sink" && !SINK_VALUES.has(raw)) {
        errors.push(`invalid sink "${raw}" (expected direct|gateway|off)`);
        continue;
      }
      updates[key] = raw;
    } else if (BOOL_KEYS.has(key)) {
      if (raw !== "true" && raw !== "false") {
        errors.push(`invalid boolean for ${key}: "${raw}"`);
        continue;
      }
      updates[key] = raw === "true";
    } else if (LIST_KEYS.has(key)) {
      updates[key] = raw.split(",").map((s) => s.trim()).filter(Boolean);
    }
  }
  return { updates, force, errors };
}
function applySetup(existing, updates, force) {
  const config = { ...existing };
  const applied = [];
  const skipped = [];
  const notices = [];
  for (const [key, value] of Object.entries(updates)) {
    const has = Object.prototype.hasOwnProperty.call(existing, key);
    const changed = JSON.stringify(existing[key]) !== JSON.stringify(value);
    if (has && changed && !force) {
      skipped.push(key);
      notices.push(`kept existing ${key} (pass ${key}=... --force to overwrite)`);
      continue;
    }
    config[key] = value;
    if (!has || changed) applied.push(key);
  }
  return { config, applied, skipped, notices };
}
function maskConfig(config) {
  const out = { ...config };
  for (const key of SECRET_KEYS) {
    if (typeof out[key] === "string" && out[key]) out[key] = "***";
  }
  return out;
}

// src/lib/cli-help.ts
function wantsHelp(args) {
  return args.includes("--help") || args.includes("-h");
}

// src/setup.ts
var USAGE = `usage: node setup.mjs [--status] [key=value ...] [--force]

Validate and merge rd-plugin config at ~/.rickydata/config.json. With no
key=value pairs it prints the current (masked) config and directory status.

  --status      print config + directory status only
  key=value     set a config key (existing keys need --force to overwrite)
  --force       allow overwriting existing keys
  -h, --help    show this help and exit
`;
async function main() {
  const args = process.argv.slice(2);
  if (wantsHelp(args)) {
    process.stdout.write(USAGE);
    return;
  }
  const statusOnly = args.includes("--status") || args.filter((a) => a.includes("=")).length === 0;
  const existing = readJsonFile(CONFIG_FILE, {});
  setLogLevel(typeof existing.log_level === "string" ? existing.log_level : "info");
  ensureDirs();
  if (statusOnly) {
    printStatus(existing);
    return;
  }
  const { updates, force, errors } = parseSetupArgs(args);
  for (const err of errors) process.stdout.write(`error: ${err}
`);
  const result = applySetup(existing, updates, force);
  if (result.applied.length > 0) {
    writeJsonFileAtomic(CONFIG_FILE, result.config);
    log("info", "setup applied", { applied: result.applied, skipped: result.skipped });
  }
  for (const notice of result.notices) process.stdout.write(`note: ${notice}
`);
  process.stdout.write(`applied: ${result.applied.join(", ") || "(none)"}
`);
  printStatus(result.config);
}
function ensureDirs() {
  for (const dir of [DATA_DIR, STATE_DIR, PENDING_DIR, QUEUE_DIR]) {
    try {
      fs3.mkdirSync(dir, { recursive: true });
    } catch {
    }
  }
}
function printStatus(config) {
  const masked = maskConfig(config);
  process.stdout.write(`config: ${CONFIG_FILE}
`);
  process.stdout.write(`${JSON.stringify(masked, null, 2)}
`);
}
main().catch((err) => {
  try {
    log("error", "setup failed", { error: err.message });
  } catch {
  }
  process.stdout.write(`setup error: ${err.message}
`);
}).finally(() => process.exit(0));
