// 抖音热榜 source 路由:有 TTD_BASE_URL 走自托管 TikTokDownloader(免费,Apache 2.0),
// 否则退化到 TikHub(需 TIKHUB_API_KEY,部分端点付费)。
// 决策在请求时取 env(而非构造时),便于 dev/test 切换。

import type { TrendSource } from "../types";
import { createTikHubTrendSource } from "./tikhub";
import { createTtdTrendSource, isTtdConfigured } from "./tiktok-downloader";

export const douyinSource: TrendSource = {
  platform: "douyin",
  fetchTrends: (opts) => {
    const source = isTtdConfigured() ? createTtdTrendSource("douyin") : createTikHubTrendSource("douyin");
    return source.fetchTrends(opts);
  }
};
