import { describe, it, expect } from "vitest";
import { parseAnalysis, analyzeTrends } from "./analyst";
import type { ScoredItem } from "./types";
import type { LLMClient } from "@/lib/llm/client";

const goodJson = JSON.stringify({
  items: [{ id: "BV1", viralLogic: "节奏快+卡点" }],
  patterns: ["前3秒高信息密度"],
  topicCards: [{ angle: "新手向", hook: "你也能", structure: "痛点-演示-CTA", refItemIds: ["BV1"] }],
});

function scored(id: string): ScoredItem {
  return {
    platform: "bilibili", id, title: "t", author: "a", authorId: "1", category: "游戏",
    tags: [], url: "u", thumbnail: "p", publishedAt: "2026-06-16T00:00:00Z", durationSec: 60,
    metrics: { views: 1000, likes: 100, coins: 50, favorites: 30, shares: 20, comments: 10, danmaku: 200 },
    signals: { engagementRate: 0.2, velocity: 80, danmakuDensity: 0.2, commentRate: 0.01 },
    potentialScore: 88, confidence: 90,
  };
}

describe("parseAnalysis", () => {
  it("解析纯 JSON", () => {
    const a = parseAnalysis(goodJson);
    expect(a.items[0].viralLogic).toContain("节奏");
    expect(a.patterns).toHaveLength(1);
    expect(a.topicCards[0].angle).toBe("新手向");
  });
  it("解析被 ```json 包裹的内容", () => {
    const a = parseAnalysis("```json\n" + goodJson + "\n```");
    expect(a.items).toHaveLength(1);
  });
  it("无法解析时抛错", () => {
    expect(() => parseAnalysis("不是JSON")).toThrow();
  });
});

describe("analyzeTrends", () => {
  it("调 client.complete 并解析", async () => {
    const client: LLMClient = { complete: async () => goodJson };
    const a = await analyzeTrends([scored("BV1")], client);
    expect(a.items[0].id).toBe("BV1");
  });
});
