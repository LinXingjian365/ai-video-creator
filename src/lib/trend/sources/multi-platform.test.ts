import { describe, expect, it } from "vitest";
import { getTrendSource } from "@/lib/trend/sources/registry";
import { mapYoutubeResponse, parseIsoDuration } from "@/lib/trend/sources/youtube";
import { douyinSource } from "@/lib/trend/sources/douyin";

describe("parseIsoDuration", () => {
  it("parses ISO 8601 durations to seconds", () => {
    expect(parseIsoDuration("PT1M30S")).toBe(90);
    expect(parseIsoDuration("PT1H2M3S")).toBe(3723);
    expect(parseIsoDuration("PT45S")).toBe(45);
    expect(parseIsoDuration("garbage")).toBe(0);
  });
});

describe("mapYoutubeResponse", () => {
  it("maps Data API v3 mostPopular items to TrendItem", () => {
    const items = mapYoutubeResponse({
      items: [
        {
          id: "abc123",
          snippet: {
            title: "How AI edits video",
            channelTitle: "AI Channel",
            channelId: "UC_x",
            categoryId: "28",
            tags: ["ai", "editing"],
            publishedAt: "2026-06-16T00:00:00Z",
            thumbnails: { medium: { url: "http://thumb/m.jpg" } }
          },
          statistics: { viewCount: "1000000", likeCount: "50000", commentCount: "3000" },
          contentDetails: { duration: "PT3M20S" }
        }
      ]
    });
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      platform: "youtube",
      id: "abc123",
      title: "How AI edits video",
      author: "AI Channel",
      url: "https://www.youtube.com/watch?v=abc123",
      durationSec: 200
    });
    expect(items[0].metrics.views).toBe(1000000);
    expect(items[0].metrics.likes).toBe(50000);
    expect(items[0].metrics.shares).toBe(0);
  });

  it("throws on API error payloads", () => {
    expect(() => mapYoutubeResponse({ error: { message: "quota exceeded" } })).toThrow(/quota exceeded/);
  });
});

describe("getTrendSource", () => {
  it("returns the matching source per platform", () => {
    expect(getTrendSource("bilibili").platform).toBe("bilibili");
    expect(getTrendSource("youtube").platform).toBe("youtube");
    expect(getTrendSource("douyin").platform).toBe("douyin");
    expect(getTrendSource("kuaishou").platform).toBe("kuaishou");
  });
});

describe("douyinSource degradation", () => {
  it("fails honestly without a third-party data key", async () => {
    await expect(douyinSource.fetchTrends({ category: "all", topN: 10 })).rejects.toThrow(/TIKHUB_API_KEY/);
  });
});
