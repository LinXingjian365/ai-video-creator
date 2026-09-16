import { describe, it, expect } from "vitest";
import { computeSignals, computeConfidence, scoreItems } from "./scorer";
import type { TrendItem } from "./types";

const NOW = Date.parse("2026-06-16T12:00:00Z");

function item(over: Partial<TrendItem> = {}): TrendItem {
  return {
    platform: "bilibili", id: "bv1", title: "t", author: "a", authorId: "1",
    category: "游戏", tags: [], url: "u", thumbnail: "p",
    publishedAt: "2026-06-16T00:00:00Z", durationSec: 60,
    metrics: { views: 1000, likes: 100, coins: 50, favorites: 30, shares: 20, comments: 10, danmaku: 200 },
    ...over,
  };
}

describe("computeSignals", () => {
  it("互动率=(赞+币+藏+转)/播放", () => {
    const s = computeSignals(item(), NOW);
    expect(s.engagementRate).toBeCloseTo((100 + 50 + 30 + 20) / 1000);
  });
  it("涨速=播放/上线小时, 发布12h前", () => {
    const s = computeSignals(item(), NOW);
    expect(s.velocity).toBeCloseTo(1000 / 12);
  });
  it("弹幕密度=弹幕/播放", () => {
    expect(computeSignals(item(), NOW).danmakuDensity).toBeCloseTo(200 / 1000);
  });
  it("播放为0时不除零", () => {
    const s = computeSignals(item({ metrics: { views: 0, likes: 0, favorites: 0, shares: 0, comments: 0 } }), NOW);
    expect(Number.isFinite(s.engagementRate)).toBe(true);
  });
});

describe("computeConfidence", () => {
  it("数据齐全且新鲜 → 高分", () => {
    expect(computeConfidence(item(), NOW)).toBeGreaterThan(80);
  });
  it("数据缺失 → 降低", () => {
    const sparse = item({ metrics: { views: 1000, likes: 0, favorites: 0, shares: 0, comments: 0 } });
    expect(computeConfidence(sparse, NOW)).toBeLessThan(computeConfidence(item(), NOW));
  });
});

describe("scoreItems", () => {
  it("按潜力分降序排列", () => {
    const high = item({ id: "high", metrics: { views: 1000, likes: 900, coins: 0, favorites: 0, shares: 0, comments: 0, danmaku: 0 } });
    const low = item({ id: "low", metrics: { views: 1000, likes: 1, coins: 0, favorites: 0, shares: 0, comments: 0, danmaku: 0 } });
    const out = scoreItems([low, high], NOW);
    expect(out[0].id).toBe("high");
    expect(out[0].potentialScore).toBeGreaterThanOrEqual(out[1].potentialScore);
  });
  it("每条带 signals/potentialScore/confidence", () => {
    const out = scoreItems([item()], NOW);
    expect(out[0]).toHaveProperty("potentialScore");
    expect(out[0]).toHaveProperty("confidence");
    expect(out[0].signals).toHaveProperty("engagementRate");
  });
});
