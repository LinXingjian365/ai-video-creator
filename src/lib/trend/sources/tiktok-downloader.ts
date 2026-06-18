// 自托管 TikTokDownloader (JoeanAmier, Apache 2.0, 11.4k★) 适配层。
// 免费替代 TikHub 抖音付费接口:在本地起 docker pull joeanamier/tiktok-downloader,
// 默认监听 http://127.0.0.1:5555,提供 /douyin/search /douyin/hot /douyin/detail 等端点。
//
// 接入策略(由 douyin.ts 协调):
//   TTD_BASE_URL 已配置 → 走 TikTokDownloader(无月费,需手动维护 Cookie 抗风控)
//   未配置 → 退化到 TikHub(走 TIKHUB_API_KEY)
//
// 返回结构与 TikHub 抖音原始字段同源(都是抓 web 接口),复用 mapTikHubTrendResponse 归一化。

import type { Platform, TrendItem, TrendSource } from "../types";
import { mapTikHubTrendResponse } from "./tikhub";

type TtdPlatform = Extract<Platform, "douyin">;

interface TtdSourceDeps {
  env?: Record<string, string | undefined>;
  fetch?: typeof fetch;
}

const DEFAULT_BASE = "http://127.0.0.1:5555";
const DEFAULT_TIMEOUT_MS = 20000;
const DEFAULT_HOT_ENDPOINT = "/douyin/hot";

function baseUrl(env: Record<string, string | undefined>) {
  return (env.TTD_BASE_URL || DEFAULT_BASE).replace(/\/+$/, "");
}

function endpointFor(env: Record<string, string | undefined>) {
  return env.TTD_DOUYIN_HOT_ENDPOINT || DEFAULT_HOT_ENDPOINT;
}

function timeoutMs(env: Record<string, string | undefined>) {
  const parsed = Number(env.TTD_TIMEOUT_MS ?? DEFAULT_TIMEOUT_MS);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_TIMEOUT_MS;
}

export function isTtdConfigured(env: Record<string, string | undefined> = process.env): boolean {
  return Boolean(env.TTD_BASE_URL || env.TTD_ENABLED === "true");
}

export async function fetchTtdTrends(
  platform: TtdPlatform,
  opts: { category: string; topN: number },
  deps: TtdSourceDeps = {}
): Promise<TrendItem[]> {
  const env = deps.env ?? process.env;
  if (!isTtdConfigured(env)) {
    throw new Error(
      "TikTokDownloader source not configured. Start the container (docker pull joeanamier/tiktok-downloader) and set TTD_BASE_URL (e.g. http://127.0.0.1:5555)."
    );
  }
  const url = `${baseUrl(env)}${endpointFor(env)}`;
  const response = await (deps.fetch ?? fetch)(url, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      // TTD 接受 token 头,留空也行;若用户在容器里设了 token,可以走 env 注入
      token: env.TTD_TOKEN ?? ""
    },
    body: JSON.stringify({ pages: 1 }),
    signal: AbortSignal.timeout(timeoutMs(env))
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`TikTokDownloader ${platform} HTTP ${response.status}: ${text}`);
  }
  const raw = text ? JSON.parse(text) : {};
  // TTD 返回结构与 TikHub 同源(都是抓抖音 web API),复用归一化
  return mapTikHubTrendResponse(raw, platform, opts.category).slice(0, opts.topN);
}

export function createTtdTrendSource(platform: TtdPlatform, deps: TtdSourceDeps = {}): TrendSource {
  return {
    platform,
    fetchTrends: (opts) => fetchTtdTrends(platform, opts, deps)
  };
}
