import { afterEach, describe, expect, it } from "vitest";
import {
  canRunPython,
  getVideoToolsPython,
  projectVenvPython,
  pythonCandidates,
  pythonModuleInvocation,
  resetVideoToolsPythonCache,
  resolveVideoToolsPython
} from "./python-tools";

describe("python tool invocations", () => {
  afterEach(() => {
    resetVideoToolsPythonCache();
  });

  it("prefers VIDEO_TOOLS_PYTHON for local video tools", () => {
    // The value must be a genuinely runnable interpreter: configuration is only
    // honoured when it works, so a fake path would (correctly) be discarded.
    const working = getVideoToolsPython();
    const result = resolveVideoToolsPython({ VIDEO_TOOLS_PYTHON: working });
    expect(result.command).toBe(working);
    expect(result.source).toBe("env");
    expect(result.configuredUsable).toBe(true);
  });

  it("builds python -m module invocations", () => {
    expect(pythonModuleInvocation("yt_dlp", ["--version"], { VIDEO_TOOLS_PYTHON: "py" })).toEqual({
      command: "py",
      args: ["-m", "yt_dlp", "--version"],
      label: "py -m yt_dlp"
    });
  });

  it("honours JIANYING_PYTHON as a fallback alias", () => {
    // Only asserted when the alias is runnable; an unusable one falls back.
    const result = resolveVideoToolsPython({ JIANYING_PYTHON: "A:/shared/python.exe" });
    expect(result.configured).toBe("A:/shared/python.exe");
    expect(["env", "discovered", "fallback-default"]).toContain(result.source);
  });

  it("keeps the project venv ahead of PATH interpreters", () => {
    const candidates = pythonCandidates();
    expect(candidates[1]).toBe(projectVenvPython());
    expect(candidates).toContain("python");
  });
});

describe("canRunPython", () => {
  it("rejects a command that does not exist", () => {
    expect(canRunPython("definitely-not-a-real-python-binary-9f3a")).toBe(false);
  });

  it("accepts the interpreter the project actually resolves to", () => {
    // Guards the Windows Store stub regression: `python` exists on PATH but
    // cannot run, so a working interpreter must still be discoverable.
    const resolved = getVideoToolsPython();
    expect(canRunPython(resolved)).toBe(true);
  });
});

describe("getVideoToolsPython auto-discovery", () => {
  afterEach(() => {
    resetVideoToolsPythonCache();
  });

  it("resolves to an interpreter that can execute, not merely one that exists", () => {
    const resolved = getVideoToolsPython();
    expect(typeof resolved).toBe("string");
    expect(resolved.length).toBeGreaterThan(0);
    expect(canRunPython(resolved)).toBe(true);
  });

  it("memoises the resolved interpreter", () => {
    const first = getVideoToolsPython();
    const second = getVideoToolsPython();
    expect(second).toBe(first);
  });
});

describe("stale VIDEO_TOOLS_PYTHON handling", () => {
  afterEach(() => {
    resetVideoToolsPythonCache();
  });

  it("falls back instead of returning an interpreter that cannot run", () => {
    // Regression: a deleted conda env used to be honoured verbatim, taking the
    // whole toolchain down with a bare ENOENT.
    const broken = "Z:/definitely-not-here/python.exe";
    const result = resolveVideoToolsPython({ VIDEO_TOOLS_PYTHON: broken });

    expect(result.configured).toBe(broken);
    expect(result.configuredUsable).toBe(false);
    expect(result.command).not.toBe(broken);
    expect(canRunPython(result.command)).toBe(true);
  });

  it("warns loudly when configured python was substituted", () => {
    const result = resolveVideoToolsPython({ VIDEO_TOOLS_PYTHON: "Z:/definitely-not-here/python.exe" });
    expect(result.warning).toContain("无法执行");
    expect(result.warning).toContain("Z:/definitely-not-here/python.exe");
  });

  it("reports no warning when nothing is configured and discovery succeeds", () => {
    resetVideoToolsPythonCache();
    const result = resolveVideoToolsPython({});
    expect(result.configuredUsable).toBeNull();
    expect(result.warning).toBeUndefined();
  });
});
