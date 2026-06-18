import { describe, expect, it, vi } from "vitest";
import { fetchTikHubTrends, mapTikHubTrendResponse } from "./tikhub";

describe("mapTikHubTrendResponse", () => {
  it("maps Douyin hot search arrays into TrendItem", () => {
    const items = mapTikHubTrendResponse({
      code: 200,
      data: {
        word_list: [
          {
            sentence: "AI剪辑副业",
            hot_value: 2500000,
            video_count: 1024
          }
        ]
      }
    }, "douyin", "all");

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      platform: "douyin",
      title: "AI剪辑副业",
      category: "all",
      url: "https://www.douyin.com/search/AI%E5%89%AA%E8%BE%91%E5%89%AF%E4%B8%9A",
      metrics: {
        views: 2500000
      }
    });
  });

  it("maps Kuaishou hot list objects into TrendItem", () => {
    const items = mapTikHubTrendResponse({
      data: {
        list: [
          {
            photoId: "3xabc",
            title: "普通人AI变现",
            user_name: "创作者A",
            play_count: "120000",
            like_count: 8000,
            comment_count: 300,
            share_count: 90,
            cover_url: "https://img.example/cover.jpg"
          }
        ]
      }
    }, "kuaishou", "hot");

    expect(items[0]).toMatchObject({
      platform: "kuaishou",
      id: "3xabc",
      title: "普通人AI变现",
      author: "创作者A",
      thumbnail: "https://img.example/cover.jpg",
      metrics: {
        views: 120000,
        likes: 8000,
        comments: 300,
        shares: 90
      }
    });
  });
});

describe("fetchTikHubTrends", () => {
  it("calls TikHub with bearer token and platform params", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      data: [{ title: "快手热榜", hot_value: 99 }]
    })));

    const items = await fetchTikHubTrends("kuaishou", { category: "society", topN: 5 }, {
      env: { TIKHUB_API_KEY: "secret-token", TIKHUB_BASE_URL: "https://api.tikhub.io" },
      fetch: fetchMock as unknown as typeof fetch
    });

    const [url, init] = fetchMock.mock.calls[0] as unknown as [URL, RequestInit];
    expect(String(url)).toBe("https://api.tikhub.io/api/v1/kuaishou/web/fetch_kuaishou_hot_list_v2?board_type=3");
    expect(init?.headers).toMatchObject({ Authorization: "Bearer secret-token" });
    expect(items[0].title).toBe("快手热榜");
  });

  it("fails honestly without a TikHub token", async () => {
    await expect(fetchTikHubTrends("douyin", { category: "all", topN: 10 }, { env: {} })).rejects.toThrow(/TIKHUB_API_KEY/);
  });
});
