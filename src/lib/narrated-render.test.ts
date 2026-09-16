import { describe, expect, it, vi } from "vitest";
import { buildNarrationSegments, renderNarratedPackage } from "@/lib/narrated-render";

describe("buildNarrationSegments", () => {
  it("collects hook + beat voiceovers, dropping empties", () => {
    const segments = buildNarrationSegments({
      hook: "  开场钩子 ",
      beats: [{ voiceover: "第一句" }, { voiceover: "  " }, { voiceover: "第二句" }, {}]
    });
    expect(segments).toEqual(["开场钩子", "第一句", "第二句"]);
  });
});

describe("renderNarratedPackage", () => {
  it("synthesizes narration, renders at narration length, then muxes audio in", async () => {
    const synthesizeNarration = vi
      .fn()
      .mockResolvedValue({ audioPath: "A:/tts/n.mp3", durationSec: 12, provider: "edge", voice: "zh-CN-XiaoxiaoNeural" });
    const renderScriptPackage = vi
      .fn()
      .mockResolvedValue({ outputPath: "A:/out/silent.mp4", compositionId: "ScriptPackageVertical", bundleLocation: "/b" });
    const muxNarration = vi.fn().mockResolvedValue(undefined);
    const mixNarrationWithBackgroundMusic = vi.fn().mockResolvedValue(undefined);

    const result = await renderNarratedPackage(
      {
        title: "标题",
        hook: "钩子",
        beats: [{ time: "0-3s", shot: "卡", voiceover: "口播一", caption: "字幕" }],
        aspectRatio: "9:16",
        outputPath: "workspace/output/remotion/narrated.mp4",
        durationPadSec: 1
      },
      { synthesizeNarration, renderScriptPackage, muxNarration, mixNarrationWithBackgroundMusic }
    );

    expect(synthesizeNarration).toHaveBeenCalledWith(["钩子", "口播一"], expect.anything());
    // video duration = narration + pad
    expect(renderScriptPackage).toHaveBeenCalledWith(expect.objectContaining({ durationSec: 13, aspectRatio: "9:16" }));
    // mux receives the silent render + the narration audio
    expect(muxNarration).toHaveBeenCalledWith("A:/out/silent.mp4", "A:/tts/n.mp3", expect.stringContaining("narrated.mp4"));
    expect(mixNarrationWithBackgroundMusic).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      silentVideoPath: "A:/out/silent.mp4",
      narrationPath: "A:/tts/n.mp3",
      durationSec: 12,
      provider: "edge"
    });
  });

  it("mixes narration with BGM when bgmPath is provided", async () => {
    const synthesizeNarration = vi
      .fn()
      .mockResolvedValue({ audioPath: "A:/tts/n.mp3", durationSec: 12, provider: "edge", voice: "zh-CN-XiaoxiaoNeural" });
    const renderScriptPackage = vi
      .fn()
      .mockResolvedValue({ outputPath: "A:/out/silent.mp4", compositionId: "ScriptPackageVertical", bundleLocation: "/b" });
    const muxNarration = vi.fn().mockResolvedValue(undefined);
    const mixNarrationWithBackgroundMusic = vi.fn().mockResolvedValue(undefined);

    const result = await renderNarratedPackage(
      {
        title: "标题",
        hook: "钩子",
        beats: [{ time: "0-3s", shot: "卡", voiceover: "口播一", caption: "字幕" }],
        bgmPath: "workspace/input/audio/bgm.mp3",
        bgmVolume: 0.15,
        narrationVolume: 1.05
      },
      { synthesizeNarration, renderScriptPackage, muxNarration, mixNarrationWithBackgroundMusic }
    );

    expect(muxNarration).not.toHaveBeenCalled();
    expect(mixNarrationWithBackgroundMusic).toHaveBeenCalledWith(expect.objectContaining({
      videoPath: "A:/out/silent.mp4",
      narrationPath: "A:/tts/n.mp3",
      bgmPath: "workspace/input/audio/bgm.mp3",
      bgmVolume: 0.15,
      narrationVolume: 1.05
    }));
    expect(result.bgmPath).toBe("workspace/input/audio/bgm.mp3");
    expect(result.bgmVolume).toBe(0.15);
  });

  it("throws when there is no voiceover to narrate", async () => {
    await expect(
      renderNarratedPackage(
        { title: "t", hook: "", beats: [{ time: "", shot: "", voiceover: "", caption: "" }] },
        {
          synthesizeNarration: vi.fn(),
          renderScriptPackage: vi.fn(),
          muxNarration: vi.fn()
        }
      )
    ).rejects.toThrow(/口播/);
  });
});
