// rd-plugin bundled output — do not edit; regenerate via `npm run build`.

// src/setup-codex.ts
import fs2 from "node:fs";
import os2 from "node:os";
import path3 from "node:path";
import { fileURLToPath } from "node:url";

// src/lib/cli-help.ts
function wantsHelp(args) {
  return args.includes("--help") || args.includes("-h");
}

// src/lib/log.ts
import fs from "node:fs";
import path2 from "node:path";

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

// src/lib/log.ts
var LEVELS = { debug: 0, info: 1, warn: 2, error: 3 };
var currentLevel = "info";
function log(level, message, fields = {}) {
  try {
    if ((LEVELS[level] ?? 1) < (LEVELS[currentLevel] ?? 1)) return;
    const entry = JSON.stringify({ ts: (/* @__PURE__ */ new Date()).toISOString(), level, message, ...fields });
    fs.mkdirSync(path2.dirname(LOG_FILE), { recursive: true });
    fs.appendFileSync(LOG_FILE, `${entry}
`, { mode: 384 });
  } catch {
  }
}

// src/codex/toml-wiring.ts
var CODEX_HOOK_EVENTS = ["UserPromptSubmit", "PreToolUse", "PermissionRequest", "PostToolUse", "Stop"];
var EVENT_MATCHERS = {
  UserPromptSubmit: null,
  PreToolUse: "*",
  PermissionRequest: "*",
  PostToolUse: "*",
  Stop: null
};
var RD_HOOK_MARKER = "codex-capture.mjs";
var LEGACY_HOOK_MARKER = "kfdb-codex-hook.mjs";
var HOOKS_BLOCK_HEADER_RE = /^\[\[hooks\.([A-Za-z0-9_]+)(?:\.hooks)?\]\]\s*$/;
var ANY_TABLE_HEADER_RE = /^\[+([^\]]+)\]+\s*$/;
var COMMAND_LINE_RE = /^(\s*command\s*=\s*)"([^"]*)"(\s*)$/;
function analyzeWiring(content) {
  const lines = content.split("\n");
  let currentEvent = null;
  let hasAnyHooksSection = false;
  const wired = /* @__PURE__ */ new Set();
  const legacy = /* @__PURE__ */ new Set();
  for (const line of lines) {
    const trimmed = line.trim();
    const hooksMatch = HOOKS_BLOCK_HEADER_RE.exec(trimmed);
    if (hooksMatch) {
      currentEvent = hooksMatch[1];
      hasAnyHooksSection = true;
      continue;
    }
    const tableMatch = ANY_TABLE_HEADER_RE.exec(trimmed);
    if (tableMatch) {
      currentEvent = null;
      continue;
    }
    if (!currentEvent) continue;
    const cmdMatch = COMMAND_LINE_RE.exec(line);
    if (!cmdMatch) continue;
    const command = cmdMatch[2];
    if (!isCodexHookEvent(currentEvent)) continue;
    if (command.includes(RD_HOOK_MARKER)) wired.add(currentEvent);
    else if (command.includes(LEGACY_HOOK_MARKER)) legacy.add(currentEvent);
  }
  const missingEvents = CODEX_HOOK_EVENTS.filter((e) => !wired.has(e) && !legacy.has(e));
  return {
    wiredEvents: CODEX_HOOK_EVENTS.filter((e) => wired.has(e)),
    legacyEvents: CODEX_HOOK_EVENTS.filter((e) => legacy.has(e)),
    missingEvents,
    fullyWired: wired.size === CODEX_HOOK_EVENTS.length,
    hasAnyHooksSection
  };
}
function isCodexHookEvent(value) {
  return CODEX_HOOK_EVENTS.includes(value);
}
function repointLegacyCommands(content, newCommand) {
  let changedCount = 0;
  const lines = content.split("\n").map((line) => {
    const match = COMMAND_LINE_RE.exec(line);
    if (!match) return line;
    if (!match[2].includes(LEGACY_HOOK_MARKER)) return line;
    changedCount += 1;
    return `${match[1]}"${newCommand}"${match[3]}`;
  });
  return { content: lines.join("\n"), changedCount };
}
function buildEventBlock(event, command) {
  const matcher = EVENT_MATCHERS[event];
  const lines = [`[[hooks.${event}]]`];
  if (matcher) lines.push(`matcher = "${matcher}"`);
  lines.push(`[[hooks.${event}.hooks]]`, `type = "command"`, `command = "${command}"`, `timeout = 10`);
  return lines.join("\n");
}
function buildFreshWiringBlock(command) {
  return CODEX_HOOK_EVENTS.map((event) => buildEventBlock(event, command)).join("\n\n");
}
var APPEND_HEADER = "# rd-plugin: Codex session capture (added by setup-codex.mjs)";
function appendEventBlocks(content, events, command) {
  if (events.length === 0) return content;
  const block = events.map((event) => buildEventBlock(event, command)).join("\n\n");
  const needsLeadingNewline = content.length > 0 && !content.endsWith("\n");
  const prefix = needsLeadingNewline ? "\n\n" : content.endsWith("\n\n") ? "" : "\n";
  return `${content}${prefix}${APPEND_HEADER}
${block}
`;
}
function applyWiring(content, newCommand) {
  const status = analyzeWiring(content);
  const repointed = repointLegacyCommands(content, newCommand);
  const withAppended = appendEventBlocks(repointed.content, status.missingEvents, newCommand);
  return {
    content: withAppended,
    repointedCount: repointed.changedCount,
    appendedEvents: status.missingEvents
  };
}

// src/setup-codex.ts
var USAGE = `usage: node setup-codex.mjs [--apply]

Wire Codex (~/.codex/config.toml) hook events to rd-plugin's codex-capture.mjs
so Codex sessions land in the same wallet-scoped knowledge graph as Claude
Code sessions. Default run is a DRY RUN that only prints what would change.

  --apply       perform the edit (writes a timestamped backup first)
  -h, --help    show this help and exit
`;
var TRUST_CAVEAT = [
  "",
  'Trust note: Codex pins a "trusted_hash" per hook command under [hooks.state]',
  "in config.toml. After wiring, interactive `codex` prompts once to trust the",
  "new command -- accept it, or the hooks stay inert. `codex exec` (non-interactive)",
  "silently skips untrusted hooks unless run with --dangerously-bypass-hook-trust.",
  ""
].join("\n");
function resolveConfigPath() {
  const codexHome = process.env.CODEX_HOME && process.env.CODEX_HOME.trim() ? process.env.CODEX_HOME : path3.join(os2.homedir(), ".codex");
  return path3.join(codexHome, "config.toml");
}
function resolveCaptureCommand() {
  const here = path3.dirname(fileURLToPath(import.meta.url));
  return `node ${path3.join(here, "codex-capture.mjs")}`;
}
function timestampSuffix() {
  return (/* @__PURE__ */ new Date()).toISOString().replace(/[:.]/g, "-");
}
async function main() {
  const args = process.argv.slice(2);
  if (wantsHelp(args)) {
    process.stdout.write(USAGE);
    return;
  }
  const apply = args.includes("--apply");
  const configPath = resolveConfigPath();
  const command = resolveCaptureCommand();
  if (!fs2.existsSync(configPath)) {
    process.stdout.write(`no Codex config found at ${configPath}

`);
    process.stdout.write("Create it (Codex reads this on startup) and add at least:\n\n");
    process.stdout.write("[features]\nplugin_hooks = true\ncodex_hooks = true\n\n");
    process.stdout.write(`${buildFreshWiringBlock(command)}
`);
    process.stdout.write(TRUST_CAVEAT);
    return;
  }
  const content = fs2.readFileSync(configPath, "utf8");
  const status = analyzeWiring(content);
  if (status.fullyWired) {
    process.stdout.write(`already wired: ${configPath}
`);
    process.stdout.write(`  events:  ${status.wiredEvents.join(", ")}
`);
    process.stdout.write(`  command: ${command}
`);
    process.stdout.write(TRUST_CAVEAT);
    return;
  }
  const plan = applyWiring(content, command);
  if (!apply) {
    process.stdout.write(`DRY RUN -- ${configPath}
`);
    if (status.wiredEvents.length > 0) process.stdout.write(`  already wired:        ${status.wiredEvents.join(", ")}
`);
    if (status.legacyEvents.length > 0) process.stdout.write(`  would repoint legacy: ${status.legacyEvents.join(", ")} (kfdb-codex-hook.mjs -> codex-capture.mjs)
`);
    if (status.missingEvents.length > 0) process.stdout.write(`  would append fresh:   ${status.missingEvents.join(", ")}
`);
    process.stdout.write(`
New hook command: ${command}
`);
    process.stdout.write("\nRun again with --apply to write the change (a timestamped backup is made first).\n");
    process.stdout.write(TRUST_CAVEAT);
    return;
  }
  const backupPath = `${configPath}.bak-rd-plugin-${timestampSuffix()}`;
  fs2.copyFileSync(configPath, backupPath);
  fs2.writeFileSync(configPath, plan.content, "utf8");
  process.stdout.write(`applied: ${configPath}
`);
  process.stdout.write(`backup:  ${backupPath}
`);
  if (status.legacyEvents.length > 0) {
    process.stdout.write(`  repointed: ${status.legacyEvents.join(", ")} (${plan.repointedCount} command line(s))
`);
  }
  if (plan.appendedEvents.length > 0) {
    process.stdout.write(`  appended:  ${plan.appendedEvents.join(", ")}
`);
  }
  process.stdout.write(TRUST_CAVEAT);
  log("info", "codex wiring applied", {
    configPath,
    repointedEvents: status.legacyEvents,
    appendedEvents: plan.appendedEvents
  });
}
main().catch((err) => {
  try {
    log("error", "setup-codex failed", { error: err.message });
  } catch {
  }
  process.stdout.write(`setup-codex error: ${err.message}
`);
}).finally(() => process.exit(0));
