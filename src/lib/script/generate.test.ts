import { describe, it, expect } from "vitest";
import { parseScript, generateScript } from "./generate";
import type { LLMClient } from "@/lib/llm/client";

const goodJson = JSON.stringify({
  titles: ["你绝对没试过的剪辑技巧", "3秒学会爆款开头"],
  hook: "99%的人开头就劝退了观众",
  beats: [
    { time: "0-3s", shot: "正脸特写", voiceover: "别再这样开头了", caption: "停！这样开头必死" },
    { time: "3-15s", shot: "屏幕录制", voiceover: "正确做法是这样", caption: "正确示范" }
  ],
  bgm: "轻快电子节奏，卡点在3s处",
  tags: ["剪辑", "自媒体", "爆款"],
  platformTips: "抖音竖屏9:16，前3秒强钩子"
});

describe("parseScript", () => {
  it("解析纯 JSON", () => {
    const s = parseScript(goodJson);
    expect(s.titles).toHaveLength(2);
    expect(s.hook).toContain("劝退");
    expect(s.beats[0].time).toBe("0-3s");
    expect(s.beats[1].caption).toBe("正确示范");
    expect(s.tags).toContain("剪辑");
  });
  it("解析被 ```json 包裹的内容", () => {
    const s = parseScript("```json\n" + goodJson + "\n```");
    expect(s.beats).toHaveLength(2);
  });
  it("缺字段时给安全默认值", () => {
    const s = parseScript('{"hook":"只有钩子"}');
    expect(s.hook).toBe("只有钩子");
    expect(s.titles).toEqual([]);
    expect(s.beats).toEqual([]);
  });
  it("无法解析时抛错", () => {
    expect(() => parseScript("这不是JSON")).toThrow();
  });
});

describe("generateScript", () => {
  it("调 client.complete 并解析", async () => {
    const client: LLMClient = { complete: async () => goodJson };
    const s = await generateScript({ topic: "AI剪辑技巧", platform: "douyin" }, client);
    expect(s.titles[0]).toContain("剪辑");
    expect(s.beats).toHaveLength(2);
  });
  it("prompt 包含选题和平台", async () => {
    let captured = "";
    const client: LLMClient = { complete: async ({ prompt }) => { captured = prompt ?? ""; return goodJson; } };
    await generateScript({ topic: "测试选题XYZ", platform: "bilibili", audience: "大学生" }, client);
    expect(captured).toContain("测试选题XYZ");
    expect(captured).toContain("bilibili");
    expect(captured).toContain("大学生");
  });
});
