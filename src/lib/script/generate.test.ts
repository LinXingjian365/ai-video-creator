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
    expect(s.citedSources).toEqual([]);
  });
  it("prompt 包含选题和平台", async () => {
    let captured = "";
    const client: LLMClient = { complete: async ({ prompt }) => { captured = prompt ?? ""; return goodJson; } };
    await generateScript({ topic: "测试选题XYZ", platform: "bilibili", audience: "大学生" }, client);
    expect(captured).toContain("测试选题XYZ");
    expect(captured).toContain("bilibili");
    expect(captured).toContain("大学生");
  });

  it("prompt 渲染事实证据并提示 LLM 引用", async () => {
    let captured = "";
    const client: LLMClient = { complete: async ({ prompt }) => { captured = prompt ?? ""; return goodJson; } };
    await generateScript(
      {
        topic: "AI 视频生成 2026",
        evidence: [
          { title: "Sora 2 vs Runway 横评", url: "https://example.com/sora-runway", snippet: "Sora 2 在物理一致性测试得分 8.7,Runway Gen-4 7.9。", publishedAt: "2026-04-12T00:00:00Z" },
          { url: "https://example.com/no-title", snippet: "无标题但有摘要的事实条目。" }
        ]
      },
      client
    );
    expect(captured).toContain("事实证据");
    expect(captured).toContain("[1] Sora 2 vs Runway 横评 (2026-04-12) — https://example.com/sora-runway");
    expect(captured).toContain("摘要: Sora 2 在物理一致性测试得分 8.7");
    // 无标题时用 url 占位
    expect(captured).toContain("[2] https://example.com/no-title");
  });

  it("无证据时 prompt 不出现事实证据章节", async () => {
    let captured = "";
    const client: LLMClient = { complete: async ({ prompt }) => { captured = prompt ?? ""; return goodJson; } };
    await generateScript({ topic: "选题", evidence: [] }, client);
    expect(captured).not.toContain("事实证据");
  });

  it("parseScript 解析 citedSources 并丢弃无效项", () => {
    const json = JSON.stringify({
      titles: ["t"],
      hook: "h",
      beats: [],
      bgm: "b",
      tags: [],
      platformTips: "p",
      citedSources: [
        { url: "https://a.example/x", used: "钩子里引用 8.7 分对比" },
        { url: "  ", used: "应被丢弃" },
        { used: "缺 url 应被丢弃" },
        { url: "https://b.example/y" } // used 缺省补空串
      ]
    });
    const s = parseScript(json);
    expect(s.citedSources).toHaveLength(2);
    expect(s.citedSources[0]).toEqual({ url: "https://a.example/x", used: "钩子里引用 8.7 分对比" });
    expect(s.citedSources[1]).toEqual({ url: "https://b.example/y", used: "" });
  });
});
