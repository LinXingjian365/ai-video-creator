import { describe, expect, it } from "vitest";
import { mapPopularResponse, mapRankingResponse, ridForCategory } from "./bilibili";

const entry = {
  bvid: "BV1xx",
  title: "测试视频",
  owner: { name: "UP主", mid: 999 },
  stat: { view: 50000, danmaku: 800, reply: 300, favorite: 1200, coin: 600, share: 400, like: 3000 },
  duration: 245,
  pubdate: 1781568000,
  pic: "http://i0.hdslb.com/x.jpg",
  tname: "游戏"
};

const rankingFixture = {
  code: 0,
  message: "OK",
  data: { list: [entry] }
};

describe("ridForCategory", () => {
  it("maps named categories to Bilibili rid", () => {
    expect(ridForCategory("all")).toBe(0);
    expect(ridForCategory("game")).toBe(4);
    expect(ridForCategory("knowledge")).toBe(36);
  });

  it("accepts numeric rid strings", () => {
    expect(ridForCategory("188")).toBe(188);
  });

  it("falls back to all for unknown categories", () => {
    expect(ridForCategory("unknown")).toBe(0);
  });
});

describe("mapRankingResponse", () => {
  it("maps ranking response to TrendItem", () => {
    const items = mapRankingResponse(rankingFixture);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      platform: "bilibili",
      id: "BV1xx",
      author: "UP主",
      category: "游戏",
      url: "https://www.bilibili.com/video/BV1xx",
      metrics: {
        views: 50000,
        coins: 600,
        comments: 300,
        danmaku: 800
      }
    });
    expect(items[0].publishedAt).toBe(new Date(1781568000 * 1000).toISOString());
  });

  it("throws on non-zero Bilibili code", () => {
    expect(() => mapRankingResponse({ code: -352, message: "risk control", data: null })).toThrow(/-352/);
  });
});

describe("mapPopularResponse", () => {
  it("maps popular response with the same entry shape", () => {
    const items = mapPopularResponse(rankingFixture);
    expect(items[0].title).toBe("测试视频");
  });
});
