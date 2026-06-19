import { describe, expect, it, vi } from "vitest";
import { buildKsdDetailText, fetchKsdDetail, isKsdConfigured, mapKsdDetailResponse } from "./ks-downloader";

const DETAIL_RESPONSE = {
  message: "获取数据成功！",
  data: {
    detailID: "3xabc",
    caption: "快手参考视频",
    name: "创作者A",
    authorID: "user-1",
    coverUrl: "https://img.example/cover.jpg",
    timestamp: "2026-06-19_12:30:00",
    duration: "00:01:05",
    viewCount: "90000",
    realLikeCount: 5000,
    commentCount: 80,
    shareCount: 12
  }
};

describe("isKsdConfigured", () => {
  it("returns true when KSD_BASE_URL is set", () => {
    expect(isKsdConfigured({ KSD_BASE_URL: "http://127.0.0.1:5557" })).toBe(true);
  });

  it("returns true when KSD_ENABLED=true", () => {
    expect(isKsdConfigured({ KSD_ENABLED: "true" })).toBe(true);
  });

  it("returns false when KSD is absent", () => {
    expect(isKsdConfigured({})).toBe(false);
  });
});

describe("mapKsdDetailResponse", () => {
  it("normalizes KS-Downloader detail response", () => {
    const item = mapKsdDetailResponse(DETAIL_RESPONSE);
    expect(item).toMatchObject({
      platform: "kuaishou",
      id: "3xabc",
      title: "快手参考视频",
      author: "创作者A",
      authorId: "user-1",
      thumbnail: "https://img.example/cover.jpg",
      durationSec: 65,
      metrics: {
        views: 90000,
        likes: 5000,
        comments: 80,
        shares: 12
      }
    });
  });

  it("falls back to id from a short-video URL", () => {
    const item = mapKsdDetailResponse({ data: { caption: "fallback" } }, "https://www.kuaishou.com/short-video/3xurl");
    expect(item.id).toBe("3xurl");
    expect(item.url).toBe("https://www.kuaishou.com/short-video/3xurl");
  });
});

describe("fetchKsdDetail", () => {
  it("posts to /detail/ with text/cookie/proxy and returns a TrendItem", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(DETAIL_RESPONSE), { status: 200 }));
    const item = await fetchKsdDetail(
      { url: "https://www.kuaishou.com/short-video/3xabc" },
      {
        env: {
          KSD_BASE_URL: "http://127.0.0.1:5557",
          KSD_COOKIE: "did=abc",
          KSD_PROXY: "http://127.0.0.1:7890"
        },
        fetch: fetchMock as unknown as typeof fetch
      }
    );

    expect(item.id).toBe("3xabc");
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("http://127.0.0.1:5557/detail/");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({
      text: "https://www.kuaishou.com/short-video/3xabc",
      cookie: "did=abc",
      proxy: "http://127.0.0.1:7890"
    });
  });

  it("builds a short-video URL from an item id", () => {
    expect(buildKsdDetailText({ itemId: "3xabc" })).toBe("https://www.kuaishou.com/short-video/3xabc");
  });

  it("throws honestly when KSD is not configured", async () => {
    await expect(fetchKsdDetail({ itemId: "3xabc" }, { env: {} })).rejects.toThrow(/KS-Downloader source not configured/);
  });
});
