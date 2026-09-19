import { describe, expect, it } from "vitest";
import { fetchTtdTrends, isTtdConfigured } from "./tiktok-downloader";

/**
 * 真实链路契约测试：确认 patches/ttd-douyin-hot.patch 打的 `/douyin/hot` 路由
 * 与本项目适配器的解析逻辑对得上（data 是 [{榜单名: [热搜词]}]）。
 *
 * 需要本机 TikTokDownloader 跑在 127.0.0.1:5555；没起时自动跳过,
 * 这样常规 `npm test` 不会因为外部服务未启动而变红。
 */

const TTD_ENV = { TTD_ENABLED: "true", TTD_BASE_URL: "http://127.0.0.1:5555" };

async function ttdReachable(): Promise<boolean> {
  try {
    const response = await fetch("http://127.0.0.1:5555/token", {
      signal: AbortSignal.timeout(3000)
    });
    return response.ok;
  } catch {
    return false;
  }
}

describe("TTD 真实链路", () => {
  it("从真实 TTD 拉到抖音热榜", async () => {
    if (!(await ttdReachable())) {
      console.log("跳过:TTD 未在 127.0.0.1:5555 运行(cd <TikTokDownloader> && .venv/Scripts/python.exe run_api.py)");
      return;
    }

    expect(isTtdConfigured(TTD_ENV)).toBe(true);

    const items = await fetchTtdTrends("douyin", { category: "hot", topN: 5 }, { env: TTD_ENV });

    expect(items.length).toBeGreaterThan(0);
    expect(items[0].title).toBeTruthy();
    expect(items[0].platform).toBe("douyin");
    // 热榜返回的是「热搜话题词」,不是视频列表:title=话题词,likes=hot_value
    expect(typeof items[0].metrics.likes).toBe("number");
  }, 90_000);
});
