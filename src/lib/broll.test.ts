import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { planBrollFromAnalysis, planBrollFromClips, stageBrollAssets, toClipUrl } from "@/lib/broll";

describe("toClipUrl", () => {
  it("passes through http(s) and file urls", () => {
    expect(toClipUrl("https://x/y.mp4")).toBe("https://x/y.mp4");
    expect(toClipUrl("file:///a/b.mp4")).toBe("file:///a/b.mp4");
  });

  it("converts an absolute path to a file url", () => {
    const url = toClipUrl("A:/clips/a.mp4");
    expect(url.startsWith("file://")).toBe(true);
    expect(url.endsWith("a.mp4")).toBe(true);
  });
});

describe("planBrollFromClips", () => {
  it("spreads clips evenly across the duration", () => {
    const clips = planBrollFromClips(["https://x/1.mp4", "https://x/2.mp4", "https://x/3.mp4"], 30);
    expect(clips.map((c) => [c.startSec, c.endSec])).toEqual([
      [0, 10],
      [10, 20],
      [20, 30]
    ]);
    expect(clips[0].src).toBe("https://x/1.mp4");
  });

  it("returns empty for no clips or non-positive duration", () => {
    expect(planBrollFromClips([], 30)).toEqual([]);
    expect(planBrollFromClips(["https://x/1.mp4"], 0)).toEqual([]);
    expect(planBrollFromClips([" ", ""], 30)).toEqual([]);
  });
});

describe("planBrollFromAnalysis", () => {
  const base = { media: { primaryVideoPath: "https://x/src.mp4" } };

  it("maps candidate in-points onto sequential output windows", () => {
    const clips = planBrollFromAnalysis(
      {
        ...base,
        candidates: [
          { id: "a", startMs: 2000, endMs: 5000, reason: "", source: "speech" },
          { id: "b", startMs: 12000, endMs: 15000, reason: "", source: "scene" }
        ],
        audio: { speechRanges: [] } as never
      } as never,
      20
    );
    expect(clips).toEqual([
      { src: "https://x/src.mp4", startSec: 0, endSec: 10, clipStartSec: 2 },
      { src: "https://x/src.mp4", startSec: 10, endSec: 20, clipStartSec: 12 }
    ]);
  });

  it("falls back to speechRanges when no candidates", () => {
    const clips = planBrollFromAnalysis(
      {
        ...base,
        candidates: [],
        audio: { speechRanges: [{ startMs: 1000, endMs: 4000, durationMs: 3000, index: 0, source: "ffmpeg-speech" }] }
      } as never,
      8
    );
    expect(clips).toEqual([{ src: "https://x/src.mp4", startSec: 0, endSec: 8, clipStartSec: 1 }]);
  });

  it("returns one full-duration clip when no windows at all", () => {
    const clips = planBrollFromAnalysis({ ...base, candidates: [], audio: { speechRanges: [] } } as never, 12);
    expect(clips).toEqual([{ src: "https://x/src.mp4", startSec: 0, endSec: 12, clipStartSec: 0 }]);
  });

  it("returns empty without a source video", () => {
    expect(planBrollFromAnalysis({ media: {}, candidates: [], audio: { speechRanges: [] } } as never, 12)).toEqual([]);
  });
});

describe("stageBrollAssets", () => {
  let workDir: string;
  let sourcePath: string;

  beforeEach(async () => {
    workDir = await fs.mkdtemp(path.join(os.tmpdir(), "broll-stage-"));
    sourcePath = path.join(workDir, "source.mp4");
    await fs.writeFile(sourcePath, "fake-video-bytes");
  });

  afterEach(async () => {
    await fs.rm(workDir, { recursive: true, force: true });
  });

  it("copies a local file:// source into publicDir and rewrites src to a static key", async () => {
    const publicDir = path.join(workDir, "public");
    const staged = await stageBrollAssets(
      [{ src: pathToFileURL(sourcePath).href, startSec: 0, endSec: 5 }],
      publicDir
    );
    expect(staged[0].src).toBe("broll/0-source.mp4");
    expect(staged[0].startSec).toBe(0);
    await expect(fs.readFile(path.join(publicDir, "broll", "0-source.mp4"), "utf8")).resolves.toBe("fake-video-bytes");
  });

  it("reuses one copy for multiple clips of the same source", async () => {
    const publicDir = path.join(workDir, "public");
    const staged = await stageBrollAssets(
      [
        { src: pathToFileURL(sourcePath).href, startSec: 0, endSec: 5, clipStartSec: 2 },
        { src: pathToFileURL(sourcePath).href, startSec: 5, endSec: 10, clipStartSec: 8 }
      ],
      publicDir
    );
    expect(staged.map((c) => c.src)).toEqual(["broll/0-source.mp4", "broll/0-source.mp4"]);
    expect(staged[1].clipStartSec).toBe(8);
    const entries = await fs.readdir(path.join(publicDir, "broll"));
    expect(entries).toEqual(["0-source.mp4"]);
  });

  it("passes http(s) sources through untouched", async () => {
    const publicDir = path.join(workDir, "public");
    const staged = await stageBrollAssets([{ src: "https://x/y.mp4", startSec: 0, endSec: 5 }], publicDir);
    expect(staged[0].src).toBe("https://x/y.mp4");
  });

  it("returns empty for no clips", async () => {
    expect(await stageBrollAssets([], path.join(workDir, "public"))).toEqual([]);
  });
});
