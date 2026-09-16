import { describe, expect, it } from "vitest";
import { buildNarrationText, resolveTtsConfig } from "@/lib/tts/synthesize";

describe("buildNarrationText", () => {
  it("joins non-empty trimmed segments with newlines", () => {
    expect(buildNarrationText(["  你好  ", "", "  世界 ", "   "])).toBe("你好\n世界");
  });

  it("returns empty string when nothing usable", () => {
    expect(buildNarrationText(["", "  "])).toBe("");
  });
});

describe("resolveTtsConfig", () => {
  it("defaults to edge + neural Chinese voice", () => {
    expect(resolveTtsConfig({}, {})).toEqual({ provider: "edge", voice: "zh-CN-XiaoxiaoNeural" });
  });

  it("falls back to SAPI Huihui voice for sapi provider", () => {
    expect(resolveTtsConfig({ provider: "sapi" }, {})).toEqual({ provider: "sapi", voice: "Microsoft Huihui Desktop" });
  });

  it("honors explicit voice and env overrides", () => {
    expect(resolveTtsConfig({ voice: "zh-CN-YunxiNeural" }, {})).toEqual({ provider: "edge", voice: "zh-CN-YunxiNeural" });
    expect(resolveTtsConfig({}, { TTS_PROVIDER: "edge", EDGE_TTS_VOICE: "zh-CN-YunyangNeural" })).toEqual({
      provider: "edge",
      voice: "zh-CN-YunyangNeural"
    });
  });
});
