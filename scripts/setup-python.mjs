// Creates the virtualenv at .venv and installs scraper/ and llm/ requirements
// into it, so nobody sets Python up by hand, on macOS, Windows or Linux.
//
// Runs on its own after `npm install` and before `npm run dev`. There it does
// nothing once the venv matches the requirements files, and it never fails the
// command: the app works without Python, and the Settings page says when the
// scraper can't run. `npm run setup:python` always reinstalls, and exits 1 if
// anything is missing, so CI can check it on every platform.
//
// Python 3.9+ must already be installed; this sets up the environment, not the
// interpreter. Set PYTHON to the interpreter to use when there's a choice.

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const VENV = path.join(ROOT, ".venv");
// Must match PYTHON in lib/scraper/runner.ts.
const VENV_PYTHON =
  process.platform === "win32"
    ? path.join(VENV, "Scripts", "python.exe")
    : path.join(VENV, "bin", "python");
const REQUIREMENTS = ["scraper/requirements.txt", "llm/requirements.txt"];
/** What was last installed: the requirements' hash and any that wouldn't install. In .venv, so a new venv starts without it. */
const STAMP = path.join(VENV, ".requirements.json");
const MIN_VERSION = [3, 9];
const AUTOMATIC = ["postinstall", "predev"].includes(process.env.npm_lifecycle_event);

// Hosted builds never run the scraper (it's off in production), so skip them.
if (AUTOMATIC && (process.env.CI || process.env.VERCEL || process.env.SKIP_PYTHON_SETUP)) process.exit(0);

try {
  setup();
} catch (error) {
  fail(`Python setup skipped: ${error.message}`, "The app still runs, but the Canvas scraper won't until this is fixed.");
}

function setup() {
  const hash = requirementsHash();
  const stamp = readStamp();
  if (AUTOMATIC && stamp?.hash === hash && runs(VENV_PYTHON, ["-c", "import sys"])) {
    if (stamp.missing.length > 0) reportMissing(stamp.missing);
    return;
  }

  // A venv without pip can't install anything, e.g. one made before Debian's
  // python3-venv was, or whose interpreter Homebrew upgraded away. Make it again.
  if (!runs(VENV_PYTHON, ["-m", "pip", "--version"])) createVenv();

  console.log("Installing Python requirements into .venv...");
  const missing = install();
  writeFileSync(STAMP, `${JSON.stringify({ hash, missing })}\n`);
  if (missing.length > 0) reportMissing(missing);
}

function createVenv() {
  const python = findPython();
  if (!python) {
    throw new Error(
      `No Python ${MIN_VERSION.join(".")}+ found. Install it from https://www.python.org/downloads/, or set PYTHON to one.`,
    );
  }
  // --clear empties a broken venv rather than failing on it.
  const clear = existsSync(VENV) ? ["--clear"] : [];
  console.log(`Creating .venv with ${python.join(" ")}...`);
  if (!succeeds(python[0], [...python.slice(1), "-m", "venv", ...clear, VENV])) {
    const hint = process.platform === "linux" ? " On Debian or Ubuntu, install python3-venv first." : "";
    throw new Error(`Could not create .venv.${hint}`);
  }
}

/** The first Python that's new enough, as a command and its leading arguments. */
function findPython() {
  const candidates = [
    ...(process.env.PYTHON ? [[process.env.PYTHON]] : []),
    ...(process.platform === "win32" ? [["py", "-3"], ["python"], ["python3"]] : [["python3"], ["python"]]),
  ];
  const check = `import sys; sys.exit(sys.version_info < (${MIN_VERSION.join(", ")}))`;
  return candidates.find(([command, ...args]) => runs(command, [...args, "-c", check])) ?? null;
}

/** Installs every requirement, and returns the ones that wouldn't install. */
function install() {
  if (pip(REQUIREMENTS.flatMap((file) => ["-r", file]))) return [];
  // One package with no build for this platform or Python fails the whole
  // install, so retry them one at a time and keep everything that will go in.
  console.log("Retrying one requirement at a time...");
  return requirementLines().filter((line) => !pip(["--quiet", line]));
}

function pip(args) {
  return succeeds(VENV_PYTHON, ["-m", "pip", "install", "--disable-pip-version-check", ...args]);
}

/** The requirement lines from every requirements file, without comments. */
function requirementLines() {
  return REQUIREMENTS.flatMap((file) =>
    readFileSync(path.join(ROOT, file), "utf8")
      .split(/\r?\n/)
      .map((line) => line.replace(/(^|\s)#.*$/, "").trim())
      .filter(Boolean),
  );
}

function requirementsHash() {
  const hash = createHash("sha256");
  for (const file of REQUIREMENTS) hash.update(`${file}\0${readFileSync(path.join(ROOT, file))}\0`);
  return hash.digest("hex");
}

function readStamp() {
  try {
    const stamp = JSON.parse(readFileSync(STAMP, "utf8"));
    return typeof stamp.hash === "string" && Array.isArray(stamp.missing) ? stamp : null;
  } catch {
    return null;
  }
}

function reportMissing(missing) {
  const version = spawnSync(VENV_PYTHON, ["-c", "import platform; print(platform.python_version())"], {
    encoding: "utf8",
  }).stdout?.trim();
  fail(
    `Python setup: these wouldn't install on Python ${version} on ${process.platform}:`,
    ...missing.map((line) => `  ${line}`),
    "Everything else is installed. They may not support this Python yet: to use another, delete .venv",
    "and run `npm run setup:python` with PYTHON set to its path.",
  );
}

/** Whether the command exits 0, without showing its output. */
function runs(command, args) {
  return spawnSync(command, args, { cwd: ROOT, stdio: "ignore" }).status === 0;
}

/** Whether the command exits 0, showing its output as it goes. */
function succeeds(command, args) {
  return spawnSync(command, args, { cwd: ROOT, stdio: "inherit" }).status === 0;
}

/** Warns, and fails `npm run setup:python` but never the hooks. */
function fail(...lines) {
  const fix = AUTOMATIC
    ? ["Fix it and run `npm run setup:python`, or set SKIP_PYTHON_SETUP=1 to stop this check."]
    : [];
  console.warn(["", ...lines, ...fix, ""].join("\n"));
  if (!AUTOMATIC) process.exitCode = 1;
}
