import { describe, expect, it, vi } from "vitest";
import { pickTitle, runFullChain, scriptDraftToRenderInput } from "@/lib/full-chain";
import type { ScriptDraft } from "@/lib/script/generate";

const draft: ScriptDraft = {
  titles: ["", "  ", "在AI里抛硬币正面真是50%吗"],
  hook: "你以为的随机其实没那么随机。",
  beats: [{ time: "0-3s", shot: "标题卡", voiceover: "抛个问题。", caption: "钩子" }],
  bgm: "轻快电子",
  tags: ["AI", "科普"],
  platformTips: "前3秒留住人"
};

describe("pickTitle", () => {
  it("picks first non-empty title", () => {
    expect(pickTitle(draft, "兜底")).toBe("在AI里抛硬币正面真是50%吗");
  });

  it("falls back to topic when no usable title", () => {
    expect(pickTitle({ ...draft, titles: ["", "   "] }, "兜底选题")).toBe("兜底选题");
  });
});

describe("scriptDraftToRenderInput", () => {
  it("maps draft fields onto remotion render input", () => {
    const input = scriptDraftToRenderInput(draft, {
      title: "标题X",
      platform: "douyin",
      aspectRatio: "9:16"
    });
    expect(input).toMatchObject({
      title: "标题X",
      hook: draft.hook,
      beats: draft.beats,
      tags: draft.tags,
      bgm: draft.bgm,
      platform: "douyin",
      aspectRatio: "9:16"
    });
  });
});

describe("runFullChain", () => {
  it("threads outputs across script -> render -> variants and reports progress", async () => {
    const generateScript = vi.fn().mockResolvedValue(draft);
    const renderScriptPackage = vi
      .fn()
      .mockResolvedValue({ outputPath: "A:/out/pkg.mp4", compositionId: "ScriptPackageVertical", bundleLocation: "/tmp/b" });
    const manifest = {
      schema: "ai-video-assistant.platform-variants.v1" as const,
      title: "在AI里抛硬币正面真是50%吗",
      inputPath: "A:/out/pkg.mp4",
      outputDir: "A:/out/publish",
      createdAt: "2026-06-17T00:00:00.000Z",
      variants: [{ id: "douyin" as const, label: "Douyin 9:16", width: 1080, height: 1920, fps: 30, mode: "crop" as const, outputPath: "A:/out/publish/d.mp4" }]
    };
    const renderPlatformVariants = vi.fn().mockResolvedValue(manifest);
    const progress: number[] = [];

    const result = await runFullChain(
      {
        topic: "硬币概率",
        platform: "douyin",
        variantTargets: ["douyin"],
        aspectRatio: "9:16",
        bgmPath: "workspace/input/audio/bgm.mp3",
        bgmVolume: 0.2
      },
      {} as never,
      { generateScript, renderScriptPackage, renderPlatformVariants, onProgress: (p) => progress.push(p) }
    );

    // script generated from the topic
    expect(generateScript).toHaveBeenCalledWith(
      expect.objectContaining({ topic: "硬币概率", platform: "douyin" }),
      expect.anything()
    );
    // render received the picked title + mapped draft
    expect(renderScriptPackage).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "在AI里抛硬币正面真是50%吗",
        hook: draft.hook,
        aspectRatio: "9:16",
        bgmPath: "workspace/input/audio/bgm.mp3",
        bgmVolume: 0.2
      })
    );
    // variants received the rendered package as input
    expect(renderPlatformVariants).toHaveBeenCalledWith(
      expect.objectContaining({ inputPath: "A:/out/pkg.mp4", targets: ["douyin"] })
    );
    expect(result.draft).toBe(draft);
    expect(result.packageVideoPath).toBe("A:/out/pkg.mp4");
    expect(result.variants).toBe(manifest);
    expect(result.bgm).toEqual({ audioPath: "workspace/input/audio/bgm.mp3", volume: 0.2 });
    expect(progress.at(-1)).toBe(100);
  });

  it("uses narrated render and runs variants on the narrated video when narrated flag is set", async () => {
    const generateScript = vi.fn().mockResolvedValue(draft);
    const renderScriptPackage = vi.fn();
    const renderNarratedPackage = vi.fn().mockResolvedValue({
      videoPath: "A:/out/narrated.mp4",
      silentVideoPath: "A:/out/silent.mp4",
      narrationPath: "A:/tts/n.mp3",
      durationSec: 14,
      provider: "edge",
      voice: "zh-CN-XiaoxiaoNeural",
      subtitleCount: 3
    });
    const manifest = {
      schema: "ai-video-assistant.platform-variants.v1" as const,
      title: "在AI里抛硬币正面真是50%吗",
      inputPath: "A:/out/narrated.mp4",
      outputDir: "A:/out/publish",
      createdAt: "2026-06-17T00:00:00.000Z",
      variants: [{ id: "douyin" as const, label: "Douyin 9:16", width: 1080, height: 1920, fps: 30, mode: "crop" as const, outputPath: "A:/out/publish/d.mp4" }]
    };
    const renderPlatformVariants = vi.fn().mockResolvedValue(manifest);

    const result = await runFullChain(
      {
        topic: "硬币概率",
        platform: "douyin",
        variantTargets: ["douyin"],
        narrated: true,
        ttsProvider: "edge",
        bgmPath: "workspace/input/audio/bgm.mp3",
        bgmVolume: 0.15,
        narrationVolume: 1.1
      },
      {} as never,
      { generateScript, renderScriptPackage, renderNarratedPackage, renderPlatformVariants }
    );

    expect(renderNarratedPackage).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "在AI里抛硬币正面真是50%吗",
        hook: draft.hook,
        ttsProvider: "edge",
        bgmPath: "workspace/input/audio/bgm.mp3",
        bgmVolume: 0.15,
        narrationVolume: 1.1
      })
    );
    expect(renderScriptPackage).not.toHaveBeenCalled();
    expect(renderPlatformVariants).toHaveBeenCalledWith(
      expect.objectContaining({ inputPath: "A:/out/narrated.mp4", targets: ["douyin"] })
    );
    expect(result.packageVideoPath).toBe("A:/out/narrated.mp4");
    expect(result.narration).toMatchObject({ provider: "edge", voice: "zh-CN-XiaoxiaoNeural", durationSec: 14, audioPath: "A:/tts/n.mp3" });
    expect(result.bgm).toEqual({ audioPath: "workspace/input/audio/bgm.mp3", volume: 0.15 });
  });
});
