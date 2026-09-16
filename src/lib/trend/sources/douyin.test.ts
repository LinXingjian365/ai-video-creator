import { describe, expect, it, vi } from "vitest";
import type { TrendItem } from "../types";
import { fetchDouyinTrends } from "./douyin";

function item(id: string): TrendItem {
  return {
    platform: "douyin",
    id,
    title: `title-${id}`,
    author: "author",
    authorId: "author-1",
    category: "tech",
    tags: [],
    url: `https://example.com/${id}`,
    thumbnail: "",
    publishedAt: "2026-09-16T00:00:00.000Z",
    durationSec: 15,
    metrics: { views: 1, likes: 1, favorites: 1, shares: 1, comments: 1 }
  };
}

const opts = { category: "tech", topN: 5 };

function source(items: TrendItem[]) {
  return { fetchTrends: vi.fn().mockResolvedValue(items) };
}

function failingSource(message: string) {
  return { fetchTrends: vi.fn().mockRejectedValue(new Error(message)) };
}

describe("fetchDouyinTrends", () => {
  it("uses TikHub directly when TTD is not configured", async () => {
    const tikhub = source([item("tikhub")]);
    const ttd = source([item("ttd")]);

    const result = await fetchDouyinTrends(opts, { env: {}, ttd, tikhub });

    expect(result.map((entry) => entry.id)).toEqual(["tikhub"]);
    expect(ttd.fetchTrends).not.toHaveBeenCalled();
  });

  it("prefers TTD when it is configured and healthy", async () => {
    const ttd = source([item("ttd")]);
    const tikhub = source([item("tikhub")]);

    const result = await fetchDouyinTrends(opts, {
      env: { TTD_ENABLED: "true" },
      ttd,
      tikhub
    });

    expect(result.map((entry) => entry.id)).toEqual(["ttd"]);
    expect(tikhub.fetchTrends).not.toHaveBeenCalled();
  });

  it("falls back to TikHub when TTD is configured but unreachable", async () => {
    const ttd = failingSource("无法连接 TikTokDownloader(http://127.0.0.1:5555)");
    const tikhub = source([item("tikhub")]);
    const log = vi.fn();

    const result = await fetchDouyinTrends(opts, {
      env: { TTD_ENABLED: "true", TIKHUB_API_KEY: "key" },
      ttd,
      tikhub,
      log
    });

    expect(result.map((entry) => entry.id)).toEqual(["tikhub"]);
    expect(log).toHaveBeenCalledWith(expect.stringContaining("回退 TikHub"));
    expect(log).toHaveBeenCalledWith(expect.stringContaining("127.0.0.1:5555"));
  });

  it("rethrows when TTD fails and no TikHub key exists", async () => {
    const ttd = failingSource("boom");
    const tikhub = source([item("tikhub")]);

    await expect(
      fetchDouyinTrends(opts, { env: { TTD_ENABLED: "true" }, ttd, tikhub })
    ).rejects.toThrow("boom");

    expect(tikhub.fetchTrends).not.toHaveBeenCalled();
  });
});
