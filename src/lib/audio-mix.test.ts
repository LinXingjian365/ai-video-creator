import { describe, expect, it } from "vitest";
import { buildBackgroundMusicArgs, buildNarrationBgmArgs, normalizeAudioVolume } from "@/lib/audio-mix";

describe("audio mix ffmpeg args", () => {
  it("loops BGM and maps it as the output audio for silent videos", () => {
    const args = buildBackgroundMusicArgs({
      videoPath: "A:/out/video.mp4",
      bgmPath: "A:/music/bgm.mp3",
      outputPath: "A:/out/mixed.mp4",
      bgmVolume: 0.2
    });

    expect(args).toContain("-stream_loop");
    expect(args).toContain("-1");
    expect(args).toContain("[1:a:0]volume=0.2[bgm]");
    expect(args).toContain("[bgm]");
    expect(args).toContain("-shortest");
  });

  it("mixes narration and BGM with amix duration pinned to narration", () => {
    const args = buildNarrationBgmArgs({
      videoPath: "A:/out/video.mp4",
      narrationPath: "A:/voice/narration.mp3",
      bgmPath: "A:/music/bgm.mp3",
      outputPath: "A:/out/mixed.mp4",
      bgmVolume: 0.16,
      narrationVolume: 1.1
    });
    const filter = args[args.indexOf("-filter_complex") + 1];

    expect(filter).toContain("[1:a:0]volume=1.1[voice]");
    expect(filter).toContain("[2:a:0]volume=0.16[bgm]");
    expect(filter).toContain("amix=inputs=2:duration=first");
    expect(args).toContain("[aout]");
  });
});

describe("normalizeAudioVolume", () => {
  it("clamps volume into a safe range", () => {
    expect(normalizeAudioVolume(undefined, 0.18, 1)).toBe(0.18);
    expect(normalizeAudioVolume(-1, 0.18, 1)).toBe(0);
    expect(normalizeAudioVolume(3, 0.18, 1)).toBe(1);
  });
});
