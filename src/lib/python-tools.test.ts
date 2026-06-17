import { describe, expect, it } from "vitest";
import { getVideoToolsPython, pythonModuleInvocation } from "./python-tools";

describe("python tool invocations", () => {
  it("prefers VIDEO_TOOLS_PYTHON for local video tools", () => {
    expect(getVideoToolsPython({ VIDEO_TOOLS_PYTHON: "A:/py312/python.exe" })).toBe("A:/py312/python.exe");
  });

  it("builds python -m module invocations", () => {
    expect(pythonModuleInvocation("yt_dlp", ["--version"], { VIDEO_TOOLS_PYTHON: "py" })).toEqual({
      command: "py",
      args: ["-m", "yt_dlp", "--version"],
      label: "py -m yt_dlp"
    });
  });
});
