import { spawnSync } from "node:child_process";
import path from "node:path";

/**
 * Interpreter used for the Python video toolchain (yt-dlp, PySceneDetect,
 * Auto-Editor, faster-whisper, edge-tts).
 *
 * Historically this pointed at one specific conda env on one specific machine,
 * and a stale `VIDEO_TOOLS_PYTHON` pointing at that env was honoured verbatim.
 * On any machine without it, every tool died with a bare
 * `spawnSync ... ENOENT` and the whole toolchain reported "down".
 *
 * Interpreters are now chosen by actually launching them, so a path that cannot
 * execute — whether it is missing, stale, or a Windows Microsoft Store alias
 * that exists on disk but refuses to run — is never selected.
 */
export const DEFAULT_VIDEO_TOOLS_PYTHON = "C:/Users/Administrator/.conda/envs/py312/python.exe";

/** Project-local toolchain venv created by `npm run tools:setup`. */
export const PROJECT_VENV_NAME = ".venv-tools";

export function projectVenvPython(): string {
  const root = process.cwd();
  return process.platform === "win32"
    ? path.join(root, PROJECT_VENV_NAME, "Scripts", "python.exe")
    : path.join(root, PROJECT_VENV_NAME, "bin", "python");
}

/**
 * Candidate interpreters in priority order. The project-local venv ranks above
 * anything on PATH so a per-project install always wins over a system one.
 */
export function pythonCandidates(): string[] {
  const candidates = [
    DEFAULT_VIDEO_TOOLS_PYTHON,
    projectVenvPython()
  ];

  if (process.platform === "win32") {
    candidates.push("py");
  }
  candidates.push("python3", "python");

  return candidates;
}

/**
 * True when `command` is a Python that can actually be executed.
 *
 * `existsSync` is not enough: the Windows Store alias and some broken symlinks
 * are present on disk but fail to launch.
 */
export function canRunPython(command: string): boolean {
  try {
    const result = spawnSync(command, ["--version"], {
      encoding: "utf8",
      timeout: 5000,
      windowsHide: true
    });
    if (result.error || result.status !== 0) {
      return false;
    }
    return /python/i.test(`${result.stdout ?? ""}${result.stderr ?? ""}`);
  } catch {
    return false;
  }
}

let cachedPython: string | null = null;

export interface PythonResolution {
  command: string;
  /** Where `command` came from. */
  source: "env" | "discovered" | "fallback-default";
  /** The configured interpreter, when `VIDEO_TOOLS_PYTHON`/`JIANYING_PYTHON` is set. */
  configured?: string;
  /** `null` when nothing is configured at all. */
  configuredUsable: boolean | null;
  /** Present when configuration was ignored, so the UI can say so out loud. */
  warning?: string;
}

/**
 * Picks the interpreter for the Python toolchain.
 *
 * An explicitly configured interpreter wins *only if it actually runs*. A stale
 * `VIDEO_TOOLS_PYTHON` — for example one left pointing at a conda env that has
 * since been deleted — used to be honoured verbatim, which silently marked
 * yt-dlp, PySceneDetect, Auto-Editor and faster-whisper all "down" with a bare
 * `spawnSync ... ENOENT`. Falling back keeps the toolchain usable and reports
 * the substitution instead of failing quietly.
 */
export function resolveVideoToolsPython(
  env: Record<string, string | undefined> = process.env
): PythonResolution {
  const configured = env.VIDEO_TOOLS_PYTHON || env.JIANYING_PYTHON;

  if (configured) {
    if (canRunPython(configured)) {
      return { command: configured, source: "env", configured, configuredUsable: true };
    }

    if (cachedPython) {
      return {
        command: cachedPython,
        source: "discovered",
        configured,
        configuredUsable: false,
        warning: `VIDEO_TOOLS_PYTHON 指向的 ${configured} 无法执行，已改用自动发现的 ${cachedPython}。请更新 .env.local 或重建该环境。`
      };
    }

    const found = pythonCandidates().find((candidate) => canRunPython(candidate));
    cachedPython = found ?? "python";
    return {
      command: cachedPython,
      source: found ? "discovered" : "fallback-default",
      configured,
      configuredUsable: false,
      warning: found
        ? `VIDEO_TOOLS_PYTHON 指向的 ${configured} 无法执行，已改用自动发现的 ${found}。请更新 .env.local 或重建该环境。`
        : `VIDEO_TOOLS_PYTHON 指向的 ${configured} 无法执行，且没有发现任何可用 Python。请安装 Python 或修正 .env.local。`
    };
  }

  if (cachedPython) {
    return { command: cachedPython, source: "discovered", configuredUsable: null };
  }

  const found = pythonCandidates().find((candidate) => canRunPython(candidate));
  cachedPython = found ?? "python";
  return {
    command: cachedPython,
    source: found ? "discovered" : "fallback-default",
    configuredUsable: null,
    warning: found ? undefined : "没有发现任何可用的 Python 解释器，工具链将不可用。运行 npm run tools:setup 或安装 Python 3.9+。"
  };
}

export function getVideoToolsPython(env: Record<string, string | undefined> = process.env): string {
  return resolveVideoToolsPython(env).command;
}

/** Test seam: drops the memoised interpreter between cases. */
export function resetVideoToolsPythonCache(): void {
  cachedPython = null;
}

export function pythonModuleInvocation(
  moduleName: string,
  args: string[] = [],
  env: Record<string, string | undefined> = process.env
) {
  const command = getVideoToolsPython(env);
  return {
    command,
    args: ["-m", moduleName, ...args],
    label: `${command} -m ${moduleName}`
  };
}
