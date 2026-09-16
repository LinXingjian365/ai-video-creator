// 抖音热榜 source 路由:有 TTD_BASE_URL 走自托管 TikTokDownloader(免费,Apache 2.0),
// 否则退化到 TikHub(需 TIKHUB_API_KEY,部分端点付费)。
// 决策在请求时取 env(而非构造时),便于 dev/test 切换。

import type { TrendItem, TrendSource } from "../types";
import { createTikHubTrendSource } from "./tikhub";
import { createTtdTrendSource, isTtdConfigured } from "./tiktok-downloader";

export interface DouyinFetchDeps {
  env?: Record<string, string | undefined>;
  log?: (message: string) => void;
  ttd?: Pick<TrendSource, "fetchTrends">;
  tikhub?: Pick<TrendSource, "fetchTrends">;
}

/**
 * TTD is free but self-hosted, so it is tried first.
 *
 * When TTD is *configured yet unreachable* the whole trend stage used to fail
 * even though a TikHub key sat unused in the same environment. Falling back
 * keeps the stage alive; the substitution is logged instead of hidden, so an
 * operator can still see that the free path is down.
 */
export async function fetchDouyinTrends(
  opts: { category: string; topN: number },
  deps: DouyinFetchDeps = {}
): Promise<TrendItem[]> {
  const env = deps.env ?? process.env;
  const log = deps.log ?? ((message: string) => console.warn(message));
  const tikhub = deps.tikhub ?? createTikHubTrendSource("douyin");

  if (!isTtdConfigured(env)) {
    return tikhub.fetchTrends(opts);
  }

  const ttd = deps.ttd ?? createTtdTrendSource("douyin");

  try {
    return await ttd.fetchTrends(opts);
  } catch (error) {
    if (!env.TIKHUB_API_KEY) {
      throw error;
    }

    const detail = error instanceof Error ? error.message : String(error);
    log(`[trend/douyin] TikTokDownloader 不可用,已回退 TikHub: ${detail}`);
    return tikhub.fetchTrends(opts);
  }
}

export const douyinSource: TrendSource = {
  platform: "douyin",
  fetchTrends: (opts) => fetchDouyinTrends(opts)
};
