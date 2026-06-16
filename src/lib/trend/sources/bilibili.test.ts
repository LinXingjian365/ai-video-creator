import { describe, it, expect } from "vitest";
import { mapRankingResponse, ridForCategory } from "./bilibili";

const fixture = {
  code: 0,
  data: {
    list: [
      {
        bvid: "BV1xx", aid: 111, title: "测试视频",
        owner: { name: "UP主", mid: 999 },
        stat: { view: 50000, danmaku: 800, reply: 300, favorite: 1200, coin: 600, share: 400, like: 3000 },
        duration: 245, pubdate: 1781568000, pic: "http://i0.hdslb.com/x.jpg", tname: "游戏",
      },
    ],
  },
};

describe("ridForCategory", () => {
  it("all → 0", () => expect(ridForCategory("all")).toBe(0));
  it("game → 4", () => expect(ridForCategory("game")).toBe(4));
  it("纯数字字符串原样转 rid", () => expect(ridForCategory("36")).toBe(36));
  it("未知分类回退 0", () => expect(ridForCategory("unknown")).toBe(0));
});

describe("mapRankingResponse", () => {
  it("映射成 TrendItem", () => {
    const items = mapRankingResponse(fixture);
    expect(items).toHaveLength(1);
    const it0 = items[0];
    expect(it0.platform).toBe("bilibili");
    expect(it0.id).toBe("BV1xx");
    expect(it0.author).toBe("UP主");
    expect(it0.url).toBe("https://www.bilibili.com/video/BV1xx");
    expect(it0.metrics.views).toBe(50000);
    expect(it0.metrics.coins).toBe(600);
    expect(it0.metrics.comments).toBe(300);
    expect(it0.metrics.danmaku).toBe(800);
    expect(it0.publishedAt).toBe(new Date(1781568000 * 1000).toISOString());
  });
  it("code 非 0 抛错", () => {
    expect(() => mapRankingResponse({ code: -412, data: null })).toThrow();
  });
});
