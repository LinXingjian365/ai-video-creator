import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildYtDlpArgs, getYtDlpInvocation, resolveMaterialOutputDir, safeCollectionName } from "./yt-dlp";

describe("safeCollectionName", () => {
  it("sanitizes Windows-hostile characters and appends timestamp", () => {
    expect(safeCollectionName("爆款:参考/视频?", 123)).toBe("爆款-参考-视频-123");
  });

  it("falls back to reference when name is empty", () => {
    expect(safeCollectionName("   ", 123)).toBe("reference-123");
  });
});

describe("resolveMaterialOutputDir", () => {
  it("defaults under workspace/input/references", () => {
    const dir = resolveMaterialOutputDir(undefined, "case-1");
    expect(dir).toContain(path.join("workspace", "input", "references", "case-1"));
  });

  it("rejects paths outside workspace/input", () => {
    expect(() => resolveMaterialOutputDir("../outside", "case-1")).toThrow("workspace/input");
  });
});

describe("buildYtDlpArgs", () => {
  const base = {
    url: "https://example.com/video",
    quality: "720p" as const,
    allowPlaylist: false,
    writeSubtitles: true,
    writeAutoSubtitles: true,
    subtitleLanguages: ["zh", "en"]
  };

  it("builds a single-video 720p import with metadata, thumbnail and subtitles", () => {
    const args = buildYtDlpArgs(base, "A:/AI视频生成剪辑助手/workspace/input/references/demo");
    expect(args).toContain("--no-playlist");
    expect(args).toContain("--write-info-json");
    expect(args).toContain("--write-thumbnail");
    expect(args).toContain("--write-subs");
    expect(args).toContain("--write-auto-subs");
    expect(args).toContain("bv*[height<=720]+ba/b[height<=720]/b");
    expect(args.at(-1)).toBe(base.url);
  });

  it("metadata mode skips media download", () => {
    const args = buildYtDlpArgs({ ...base, quality: "metadata" }, "workspace/input/references/demo");
    expect(args).toContain("--skip-download");
  });

  it("audio mode extracts mp3", () => {
    const args = buildYtDlpArgs({ ...base, quality: "audio" }, "workspace/input/references/demo");
    expect(args).toContain("--extract-audio");
    expect(args).toContain("--audio-format");
    expect(args).toContain("mp3");
  });
});

describe("getYtDlpInvocation", () => {
  it("uses a python module invocation on Windows when no binary override exists", () => {
    const invocation = getYtDlpInvocation();
    if (process.platform !== "win32") {
      expect(invocation.command).toBe("yt-dlp");
      return;
    }

    expect(invocation.prefixArgs).toEqual(["-m", "yt_dlp"]);
    expect(invocation.label).toContain("-m yt_dlp");
  });
});
