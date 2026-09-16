import { describe, expect, it, vi } from "vitest";
import {
  canUseTtdAuthed,
  fetchTtdDouyinCommentsRaw,
  fetchTtdDouyinSearchRaw,
  fetchTtdTrends,
  isTtdConfigured,
  mapTtdHotResponse
} from "./tiktok-downloader";

const HOT_RESPONSE = JSON.stringify({
  message: "获取数据成功！",
  data: [
    {
      抖音热榜: [
        {
          word: "我的端午落地签",
          sentence_id: "2539115",
          hot_value: 12113643,
          view_count: 64095513,
          discuss_video_count: 5,
          event_time: 1781757271,
          word_cover: { url_list: ["https://p.example/cover1.jpeg"] }
        },
        {
          word: "永远跟党走",
          sentence_id: "2539817",
          hot_value: 8000000,
          view_count: 30000000,
          discuss_video_count: 3
        }
      ]
    },
    {
      娱乐榜: [
        {
          word: "某综艺official",
          sentence_id: "9001",
          hot_value: 5000000,
          view_count: 1200000,
          discuss_video_count: 2
        },
        // 与主榜重复 sentence_id,应被去重
        {
          word: "我的端午落地签",
          sentence_id: "2539115",
          hot_value: 12113643,
          view_count: 64095513,
          discuss_video_count: 5
        }
      ]
    }
  ]
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

describe("mapTtdHotResponse", () => {
  it("flattens all boards and dedups by sentence_id", () => {
    const items = mapTtdHotResponse(JSON.parse(HOT_RESPONSE), "", 10);
    // 3 unique topics (主榜 2 + 娱乐榜 1 unique; 1 重复被去重)
    expect(items).toHaveLength(3);
    expect(items[0]).toMatchObject({
      platform: "douyin",
      id: "2539115",
      title: "我的端午落地签",
      category: "抖音热榜",
      author: "抖音热榜"
    });
    expect(items[0].metrics.views).toBe(64095513);
    expect(items[0].metrics.likes).toBe(12113643);
    expect(items[0].metrics.comments).toBe(5);
    expect(items[0].url).toBe(
      `https://www.douyin.com/search/${encodeURIComponent("我的端午落地签")}`
    );
    expect(items[0].thumbnail).toBe("https://p.example/cover1.jpeg");
    expect(items[0].publishedAt).toBe(new Date(1781757271 * 1000).toISOString());
  });

  it("filters to a single board when category matches a board name", () => {
    const items = mapTtdHotResponse(JSON.parse(HOT_RESPONSE), "娱乐榜", 10);
    // 只取娱乐榜的两条(跨榜去重不参与,因为主榜被整体跳过)
    expect(items).toHaveLength(2);
    expect(items.every((i) => i.category === "娱乐榜")).toBe(true);
    expect(items[0].title).toBe("某综艺official");
  });

  it("returns empty for malformed payloads", () => {
    expect(mapTtdHotResponse({}, "", 10)).toEqual([]);
    expect(mapTtdHotResponse({ data: null }, "", 10)).toEqual([]);
  });
});

describe("fetchTtdTrends", () => {
  it("posts to /douyin/hot and normalizes the hot board", async () => {
    const fetchMock = vi.fn(async () => new Response(HOT_RESPONSE, { status: 200 }));
    const items = await fetchTtdTrends(
      "douyin",
      { category: "hot", topN: 5 },
      { env: { TTD_BASE_URL: "http://127.0.0.1:5555" }, fetch: fetchMock as unknown as typeof fetch }
    );

    expect(items).toHaveLength(3);
    expect(items[0]).toMatchObject({ platform: "douyin", id: "2539115", title: "我的端午落地签" });

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("http://127.0.0.1:5555/douyin/hot");
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>)["Content-Type"]).toBe("application/json");
    expect((init.headers as Record<string, string>).token).toBe("");
    expect(init.body).toBe("{}");
  });

  it("sends cookie in body when TTD_DOUYIN_COOKIE is set", async () => {
    const fetchMock = vi.fn(async () => new Response(HOT_RESPONSE, { status: 200 }));
    await fetchTtdTrends(
      "douyin",
      { category: "hot", topN: 1 },
      {
        env: { TTD_BASE_URL: "http://x", TTD_DOUYIN_COOKIE: "sessionid=abc" },
        fetch: fetchMock as unknown as typeof fetch
      }
    );
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toEqual({ cookie: "sessionid=abc" });
  });

  it("respects TTD_TOKEN env when configured", async () => {
    const fetchMock = vi.fn(async () => new Response(HOT_RESPONSE, { status: 200 }));
    await fetchTtdTrends(
      "douyin",
      { category: "hot", topN: 1 },
      { env: { TTD_BASE_URL: "http://example.local", TTD_TOKEN: "secret" }, fetch: fetchMock as unknown as typeof fetch }
    );
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect((init.headers as Record<string, string>).token).toBe("secret");
  });

  it("respects TTD_DOUYIN_HOT_ENDPOINT override", async () => {
    const fetchMock = vi.fn(async () => new Response(HOT_RESPONSE, { status: 200 }));
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
    const fetchMock = vi.fn(async () => new Response(HOT_RESPONSE, { status: 200 }));
    const items = await fetchTtdTrends(
      "douyin",
      { category: "hot", topN: 1 },
      { env: { TTD_BASE_URL: "http://x" }, fetch: fetchMock as unknown as typeof fetch }
    );
    expect(items).toHaveLength(1);
  });
});

describe("canUseTtdAuthed", () => {
  it("true only when TTD configured AND douyin cookie present", () => {
    expect(canUseTtdAuthed({ TTD_BASE_URL: "http://x", TTD_DOUYIN_COOKIE: "c" })).toBe(true);
    expect(canUseTtdAuthed({ TTD_ENABLED: "true", TTD_DOUYIN_COOKIE: "c" })).toBe(true);
  });
  it("false when cookie missing (avoids regressing TikHub search path)", () => {
    expect(canUseTtdAuthed({ TTD_BASE_URL: "http://x" })).toBe(false);
    expect(canUseTtdAuthed({ TTD_DOUYIN_COOKIE: "c" })).toBe(false); // not configured
    expect(canUseTtdAuthed({})).toBe(false);
  });
});

describe("fetchTtdDouyinSearchRaw / CommentsRaw", () => {
  it("POSTs search to /douyin/search/video with keyword + cookie, returns raw", async () => {
    const payload = { data: { list: [{ aweme_id: "1", desc: "x" }] } };
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(payload), { status: 200 }));
    const raw = await fetchTtdDouyinSearchRaw("AI剪辑", 5, {
      env: { TTD_BASE_URL: "http://127.0.0.1:5555", TTD_DOUYIN_COOKIE: "sid=1" },
      fetch: fetchMock as unknown as typeof fetch
    });
    expect(raw).toEqual(payload);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("http://127.0.0.1:5555/douyin/search/video");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toMatchObject({ keyword: "AI剪辑", count: 5, source: true, cookie: "sid=1" });
  });

  it("POSTs comments to /douyin/comment with detail_id, clamps count to 20", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ data: { comments: [] } }), { status: 200 }));
    await fetchTtdDouyinCommentsRaw("7777", 50, {
      env: { TTD_BASE_URL: "http://x", TTD_DOUYIN_COMMENT_ENDPOINT: "/custom/comment" },
      fetch: fetchMock as unknown as typeof fetch
    });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("http://x/custom/comment");
    expect(JSON.parse(init.body as string)).toMatchObject({ detail_id: "7777", count: 20 });
  });

  it("surfaces HTTP errors verbatim", async () => {
    const fetchMock = vi.fn(async () => new Response("boom", { status: 500 }));
    await expect(
      fetchTtdDouyinSearchRaw("x", 5, { env: { TTD_BASE_URL: "http://x" }, fetch: fetchMock as unknown as typeof fetch })
    ).rejects.toThrow(/TikTokDownloader HTTP 500: boom/);
  });
});
