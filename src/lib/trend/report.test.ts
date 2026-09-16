import { describe, it, expect } from "vitest";
import { assembleReport, buildReport } from "./report";
import type { ScoredItem, TrendItem, TrendSource } from "./types";
import type { LLMClient } from "@/lib/llm/client";

const NOW = Date.parse("2026-06-16T12:00:00Z");

function rawItem(id: string): TrendItem {
  return {
    platform: "bilibili", id, title: "t" + id, author: "a", authorId: "1", category: "游戏",
    tags: [], url: "u", thumbnail: "p", publishedAt: "2026-06-16T00:00:00Z", durationSec: 60,
    metrics: { views: 1000, likes: 100, coins: 50, favorites: 30, shares: 20, comments: 10, danmaku: 200 },
  };
}

const source: TrendSource = { platform: "bilibili", fetchTrends: async () => [rawItem("BV1"), rawItem("BV2")] };

describe("assembleReport", () => {
  it("无分析(降级)时 aiStatus=failed, viralLogic 为空", () => {
    const scored = [{ ...rawItem("BV1"), signals: { engagementRate: 0.1, velocity: 50, commentRate: 0.01 }, potentialScore: 80, confidence: 90 } as ScoredItem];
    const r = assembleReport("bilibili", "all", scored, null, NOW);
    expect(r.aiStatus).toBe("failed");
    expect(r.items[0].viralLogic).toBe("");
    expect(r.itemCount).toBe(1);
  });
});

describe("buildReport", () => {
  it("LLM 成功 → aiStatus=ok, 注入 viralLogic", async () => {
    const client: LLMClient = { complete: async () => JSON.stringify({ items: [{ id: "BV1", viralLogic: "快节奏" }], patterns: ["p"], topicCards: [] }) };
    const r = await buildReport({ platform: "bilibili", category: "all", source, client, topN: 10, nowMs: NOW });
    expect(r.aiStatus).toBe("ok");
    expect(r.items.find((i) => i.id === "BV1")?.viralLogic).toBe("快节奏");
  });
  it("LLM 抛错 → 诚实降级 aiStatus=failed, 保留真实榜单", async () => {
    const client: LLMClient = { complete: async () => { throw new Error("boom"); } };
    const r = await buildReport({ platform: "bilibili", category: "all", source, client, topN: 10, nowMs: NOW });
    expect(r.aiStatus).toBe("failed");
    expect(r.items).toHaveLength(2);
  });
  it("LLM 卡住 → 超时降级 aiStatus=failed, 保留真实榜单", async () => {
    const client: LLMClient = { complete: () => new Promise(() => undefined) };
    const logs: string[] = [];
    const r = await buildReport({
      platform: "bilibili",
      category: "all",
      source,
      client,
      topN: 10,
      nowMs: NOW,
      llmTimeoutMs: 5,
      onLog: (message) => logs.push(message)
    });
    expect(r.aiStatus).toBe("failed");
    expect(r.items).toHaveLength(2);
    expect(logs.at(-1)).toContain("timed out");
  });
  it("无 client → 降级仅榜单", async () => {
    const r = await buildReport({ platform: "bilibili", category: "all", source, client: null, topN: 10, nowMs: NOW });
    expect(r.aiStatus).toBe("failed");
    expect(r.items).toHaveLength(2);
  });
});
