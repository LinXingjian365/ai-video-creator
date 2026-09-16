#!/usr/bin/env node
/**
 * Creates the project-local Python toolchain venv (`.venv-tools`) and installs
 * the video tools the app shells out to:
 *
 *   yt-dlp         reference material import          (--write-info-json/subs)
 *   scenedetect    PySceneDetect, shot boundary cuts
 *   auto-editor    silence-based rough cut previews
 *   faster-whisper local ASR when no subtitle exists   (optional, large)
 *
 * Why a dedicated venv instead of the system Python: the app only ever calls
 * these as `python -m <module>`, so a self-contained venv keeps the project
 * reproducible and avoids colliding with whatever the machine already has.
 *
 * Usage:
 *   npm run tools:setup                 # core tools
 *   npm run tools:setup -- --with-asr   # also install faster-whisper
 *   npm run tools:setup -- --base-python /path/to/python3.11
 */

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const ROOT = process.cwd();
const VENV_DIR = path.join(ROOT, ".venv-tools");
const CORE_PACKAGES = ["yt-dlp", "scenedetect", "auto-editor"];
const ASR_PACKAGES = ["faster-whisper"];

function args() {
  return process.argv.slice(2);
}

function flag(name) {
  return args().includes(`--${name}`);
}

function optionValue(name) {
  const list = args();
  const index = list.indexOf(`--${name}`);
  return index >= 0 ? list[index + 1] : undefined;
}

function venvPython() {
  return process.platform === "win32"
    ? path.join(VENV_DIR, "Scripts", "python.exe")
    : path.join(VENV_DIR, "bin", "python");
}

function run(command, commandArgs, options = {}) {
  const result = spawnSync(command, commandArgs, {
    encoding: "utf8",
    windowsHide: true,
    ...options
  });
  return {
    ok: !result.error && result.status === 0,
    status: result.status,
    error: result.error,
    output: `${result.stdout ?? ""}${result.stderr ?? ""}`.trim()
  };
}

/**
 * Picks a base interpreter that can actually run.
 *
 * `existsSync` is deliberately not used: on Windows `python` often resolves to
 * the Microsoft Store alias in System32, which is a real file that cannot be
 * executed.
 */
function findBasePython() {
  const configured = optionValue("base-python");
  const candidates = [configured, "python3", "python", "py"].filter(Boolean);

  for (const candidate of candidates) {
    const result = run(candidate, ["--version"]);
    if (!result.ok) {
      continue;
    }
    const version = /Python\s+(\d+)\.(\d+)(?:\.(\d+))?/i.exec(result.output);
    if (!version) {
      continue;
    }
    const major = Number(version[1]);
    const minor = Number(version[2]);
    if (major === 3 && minor >= 9) {
      return { command: candidate, version: result.output.split(/\r?\n/)[0] };
    }
    console.warn(`跳过 ${candidate} (${result.output.split(/\r?\n/)[0]})：需要 Python 3.9+。`);
  }

  return null;
}

function ensureVenv(basePython) {
  if (fs.existsSync(venvPython())) {
    console.log(`已存在工具链环境：${venvPython()}`);
    return true;
  }

  console.log(`创建工具链环境：${VENV_DIR}`);
  const created = run(basePython.command, ["-m", "venv", VENV_DIR]);
  if (!created.ok) {
    console.error(`创建 venv 失败：${created.error?.message ?? created.output}`);
    return false;
  }
  return true;
}

function install(venv, packages) {
  const result = run(venv, ["-m", "pip", "install", "--disable-pip-version-check", "-U", ...packages], {
    stdio: "inherit"
  });
  return result.ok;
}

/**
 * pyJianYingDraft is pinned in scripts/requirements.txt — 0.3.0 removed
 * `ScriptFile.add_track()`, which the draft generator still calls.
 */
function installJianying(venv) {
  const requirements = path.join(ROOT, "scripts", "requirements.txt");
  if (!fs.existsSync(requirements)) {
    console.error(`缺少 ${requirements}`);
    return false;
  }

  const result = run(venv, ["-m", "pip", "install", "--disable-pip-version-check", "-r", requirements], {
    stdio: "inherit"
  });
  return result.ok;
}

function report(venv) {
  const modules = [
    ["yt-dlp", "yt_dlp"],
    ["PySceneDetect", "scenedetect"],
    ["Auto-Editor", "auto_editor"],
    ["faster-whisper", "faster_whisper"]
  ];

  console.log("\n工具链状态：");
  for (const [label, moduleName] of modules) {
    const probe = run(venv, ["-c", `import ${moduleName}; print(getattr(${moduleName}, '__version__', 'ok'))`]);
    const detail = probe.ok ? probe.output.split(/\r?\n/).pop() : "未安装";
    console.log(`  ${probe.ok ? "✅" : "⬜"} ${label.padEnd(15)} ${detail}`);
  }
}

function main() {
  const basePython = findBasePython();
  if (!basePython) {
    console.error("找不到可用的 Python 3.9+。请先安装 Python，或用 --base-python <path> 指定。");
    process.exit(1);
  }
  console.log(`使用基础解释器：${basePython.command} (${basePython.version})`);

  if (!ensureVenv(basePython)) {
    process.exit(1);
  }

  const venv = venvPython();
  const packages = flag("with-asr") ? [...CORE_PACKAGES, ...ASR_PACKAGES] : CORE_PACKAGES;

  console.log(`安装：${packages.join(", ")}`);
  if (!install(venv, packages)) {
    console.error("安装失败，详见上方 pip 输出。");
    process.exit(1);
  }

  if (flag("with-jianying")) {
    console.log("安装剪映草稿依赖（scripts/requirements.txt）");
    if (!installJianying(venv)) {
      console.error("剪映依赖安装失败，详见上方 pip 输出。");
      process.exit(1);
    }
  }

  report(venv);
  console.log(`\n完成。应用会自动发现 ${venv}；也可在 .env.local 设置 VIDEO_TOOLS_PYTHON 覆盖。`);
}

main();
