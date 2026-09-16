import { describe, expect, it, vi } from "vitest";
import { runTikHubResearch } from "./research";

describe("runTikHubResearch", () => {
  it("runs keyword search and normalizes material candidates", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      data: {
        list: [
          {
            aweme_id: "123",
            desc: "AI剪辑爆款",
            nickname: "创作者",
            play_count: 500000,
            digg_count: 30000,
            comment_count: 1200,
            share_url: "https://www.douyin.com/video/123"
          }
        ]
      }
    })));

    const report = await runTikHubResearch({
      platform: "douyin",
      query: "AI剪辑",
      limit: 3
    }, {
      env: { TIKHUB_API_KEY: "token", TIKHUB_BASE_URL: "https://api.tikhub.io" },
      fetch: fetchMock as unknown as typeof fetch,
      now: () => new Date("2026-06-18T00:00:00Z")
    });

    expect(report.searchItems).toHaveLength(1);
    expect(report.searchItems[0].title).toBe("AI剪辑爆款");
    expect(report.materialCandidates[0]).toMatchObject({
      title: "AI剪辑爆款",
      source: "search"
    });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [URL, RequestInit];
    expect(String(url)).toContain("/api/v1/douyin/app/v3/fetch_video_search_result");
    expect(String(url)).toContain("keyword=AI");
    expect(init.headers).toMatchObject({ Authorization: "Bearer token" });
  });

  it("runs detail plus comments with platform-specific params", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        data: {
          photoId: "3xabc",
          title: "快手参考视频",
          user_name: "达人",
          play_count: "90000"
        }
      })))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        data: {
          comments: [
            { commentId: "c1", content: "这个方法真有用", like_count: 88, sub_comment_count: 2 }
          ]
        }
      })));

    const report = await runTikHubResearch({
      platform: "kuaishou",
      itemId: "3xabc",
      includeComments: true,
      limit: 5
    }, {
      env: { TIKHUB_API_KEY: "token", TIKHUB_BASE_URL: "https://api.tikhub.io" },
      fetch: fetchMock as unknown as typeof fetch
    });

    expect(report.detail?.id).toBe("3xabc");
    expect(report.comments[0]).toMatchObject({ text: "这个方法真有用", likes: 88, replies: 2 });
    expect(report.endpointCalls.map((call) => call.kind)).toEqual(["detail", "comments"]);
    expect(String(fetchMock.mock.calls[1][0])).toContain("photo_id=3xabc");
  });

  it("uses KS-Downloader for free Kuaishou detail without requiring TikHub key", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      data: {
        detailID: "3xabc",
        caption: "快手免费详情",
        name: "创作者A",
        viewCount: "90000",
        realLikeCount: 1000
      }
    })));

    const report = await runTikHubResearch({
      platform: "kuaishou",
      itemId: "3xabc",
      includeComments: true
    }, {
      env: { KSD_BASE_URL: "http://127.0.0.1:5557" },
      fetch: fetchMock as unknown as typeof fetch
    });

    expect(report.detail).toMatchObject({
      platform: "kuaishou",
      id: "3xabc",
      title: "快手免费详情"
    });
    expect(report.comments).toEqual([]);
    expect(report.nextActions).toContain("Comments were skipped because TikHub key is missing; KS-Downloader currently supplies free Kuaishou detail only.");
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("http://127.0.0.1:5557/detail/");
    expect(JSON.parse(init.body as string).text).toBe("https://www.kuaishou.com/short-video/3xabc");
  });

  it("uses TikTokDownloader for free Douyin search when TTD_DOUYIN_COOKIE is set, without TikHub key", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      data: {
        list: [
          { aweme_id: "999", desc: "TTD免费搜索命中", nickname: "作者", play_count: 12345, digg_count: 678, share_url: "https://www.douyin.com/video/999" }
        ]
      }
    })));

    const report = await runTikHubResearch({
      platform: "douyin",
      query: "AI",
      limit: 3
    }, {
      env: { TTD_BASE_URL: "http://127.0.0.1:5555", TTD_DOUYIN_COOKIE: "sessionid=abc" },
      fetch: fetchMock as unknown as typeof fetch
    });

    expect(report.searchItems).toHaveLength(1);
    expect(report.searchItems[0].title).toBe("TTD免费搜索命中");
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("http://127.0.0.1:5555/douyin/search/video");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toMatchObject({ keyword: "AI", cookie: "sessionid=abc", source: true });
    expect(report.endpointCalls[0]).toMatchObject({ kind: "search", endpoint: "/douyin/search/video" });
  });

  it("still requires TikHub key for Douyin search when no TTD cookie is set", async () => {
    await expect(
      runTikHubResearch(
        { platform: "douyin", query: "AI" },
        { env: { TTD_BASE_URL: "http://127.0.0.1:5555" } } // TTD configured but no cookie → not free path
      )
    ).rejects.toThrow(/TIKHUB_API_KEY/);
  });

  it("fails honestly without a key", async () => {
    await expect(runTikHubResearch({ platform: "douyin", query: "AI" }, { env: {} })).rejects.toThrow(/TIKHUB_API_KEY/);
  });
});
