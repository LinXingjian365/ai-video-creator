import { describe, expect, it, vi } from "vitest";
import { fetchTtdTrends, isTtdConfigured } from "./tiktok-downloader";

const TTD_RESPONSE = JSON.stringify({
  data: {
    list: [
      {
        aweme_id: "ttd-1",
        desc: "TikTokDownloader 抖音热榜样品标题",
        nickname: "测试创作者",
        play_count: 88000,
        digg_count: 4200,
        comment_count: 310,
        share_count: 88,
        share_url: "https://www.douyin.com/video/ttd-1"
      },
      {
        aweme_id: "ttd-2",
        desc: "第二条热榜",
        nickname: "另一创作者",
        play_count: 50000,
        digg_count: 2000,
        comment_count: 100,
        share_url: "https://www.douyin.com/video/ttd-2"
      }
    ]
  }
});

describe("isTtdConfigured", () => {
  it("returns true when TTD_BASE_URL is set", () => {
    expect(isTtdConfigured({ TTD_BASE_URL: "http://127.0.0.1:5555" })).toBe(true);
  });
  it("returns true when TTD_ENABLED=true", () => {
    expect(isTtdConfigured({ TTD_ENABLED: "true" })).toBe(true);
  });
  it("returns false when neither is set", () => {
    expect(isTtdConfigured({})).toBe(false);
  });
});

describe("fetchTtdTrends", () => {
  it("posts to TTD hot endpoint and normalizes the response", async () => {
    const fetchMock = vi.fn(async () => new Response(TTD_RESPONSE, { status: 200 }));
    const items = await fetchTtdTrends(
      "douyin",
      { category: "hot", topN: 5 },
      { env: { TTD_BASE_URL: "http://127.0.0.1:5555" }, fetch: fetchMock as unknown as typeof fetch }
    );

    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({
      platform: "douyin",
      id: "ttd-1",
      title: "TikTokDownloader 抖音热榜样品标题",
      author: "测试创作者"
    });
    expect(items[0].metrics.views).toBe(88000);
    expect(items[0].metrics.likes).toBe(4200);

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("http://127.0.0.1:5555/douyin/hot");
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>)["Content-Type"]).toBe("application/json");
    expect((init.headers as Record<string, string>).token).toBe("");
  });

  it("respects TTD_TOKEN env when configured", async () => {
    const fetchMock = vi.fn(async () => new Response(TTD_RESPONSE, { status: 200 }));
    await fetchTtdTrends(
      "douyin",
      { category: "hot", topN: 1 },
      { env: { TTD_BASE_URL: "http://example.local", TTD_TOKEN: "secret" }, fetch: fetchMock as unknown as typeof fetch }
    );
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect((init.headers as Record<string, string>).token).toBe("secret");
  });

  it("respects TTD_DOUYIN_HOT_ENDPOINT override", async () => {
    const fetchMock = vi.fn(async () => new Response(TTD_RESPONSE, { status: 200 }));
    await fetchTtdTrends(
      "douyin",
      { category: "hot", topN: 1 },
      {
        env: { TTD_BASE_URL: "http://example.local", TTD_DOUYIN_HOT_ENDPOINT: "/custom/hot" },
        fetch: fetchMock as unknown as typeof fetch
      }
    );
    const [url] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("http://example.local/custom/hot");
  });

  it("throws when not configured (honest degradation)", async () => {
    await expect(
      fetchTtdTrends(
        "douyin",
        { category: "hot", topN: 5 },
        { env: {}, fetch: vi.fn() as unknown as typeof fetch }
      )
    ).rejects.toThrow(/TikTokDownloader source not configured/);
  });

  it("surfaces upstream HTTP errors verbatim", async () => {
    const fetchMock = vi.fn(async () => new Response("internal error", { status: 500 }));
    await expect(
      fetchTtdTrends(
        "douyin",
        { category: "hot", topN: 1 },
        { env: { TTD_BASE_URL: "http://x" }, fetch: fetchMock as unknown as typeof fetch }
      )
    ).rejects.toThrow(/TikTokDownloader douyin HTTP 500: internal error/);
  });

  it("clamps results to topN", async () => {
    const fetchMock = vi.fn(async () => new Response(TTD_RESPONSE, { status: 200 }));
    const items = await fetchTtdTrends(
      "douyin",
      { category: "hot", topN: 1 },
      { env: { TTD_BASE_URL: "http://x" }, fetch: fetchMock as unknown as typeof fetch }
    );
    expect(items).toHaveLength(1);
  });
});
