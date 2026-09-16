// 自托管 TikTokDownloader (JoeanAmier, Apache 2.0, 11.4k★) 适配层。
// 免费替代 TikHub 抖音付费接口:本机原生跑 `python run_api.py`(或 docker),默认监听
// http://127.0.0.1:5555。本项目给它的 API server 补了一个 `/douyin/hot` 路由
// (调用内部 hot.py 的 HotBoard 接口),无需 SaaS 计费,空 body 即可拉到抖音热榜。
//
// 接入策略(由 douyin.ts 协调):
//   TTD_BASE_URL / TTD_ENABLED 已配置 → 走 TikTokDownloader(免费,自托管)
//   未配置 → 退化到 TikHub(走 TIKHUB_API_KEY,按次计费)
//
// 注意:抖音热榜返回的是「热搜话题词」(word + hot_value),不是视频列表。
// 因此这里把每个话题映射成一条 TrendItem:title=话题词,likes=hot_value,views=view_count,
// comments=讨论视频数,url=该话题的抖音搜索页。与 TikHub 视频结构不同,故单独归一化。

import type { Platform, TrendItem, TrendSource } from "../types";

type TtdPlatform = Extract<Platform, "douyin">;

interface TtdSourceDeps {
  env?: Record<string, string | undefined>;
  fetch?: typeof fetch;
}

const DEFAULT_BASE = "http://127.0.0.1:5555";
// 热榜接口实时拉取 4 个榜单(主榜/娱乐/社会/挑战)+ 抖音签名,实测约 30s,故默认放宽到 60s
const DEFAULT_TIMEOUT_MS = 60000;
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

interface HotWord {
  word?: string;
  sentence_id?: string | number;
  group_id?: string | number;
  hot_value?: number;
  view_count?: number;
  video_count?: number;
  discuss_video_count?: number;
  event_time?: number;
  word_cover?: { url_list?: string[] };
}

function toIso(eventTimeSec?: number): string {
  if (typeof eventTimeSec !== "number" || !Number.isFinite(eventTimeSec) || eventTimeSec <= 0) {
    return "";
  }
  return new Date(eventTimeSec * 1000).toISOString();
}

function mapHotWord(word: HotWord, boardName: string): TrendItem {
  const title = String(word.word ?? "").trim();
  const id = String(word.sentence_id ?? word.group_id ?? title);
  return {
    platform: "douyin",
    id,
    title,
    author: boardName, // 话题无作者,以榜单名占位
    authorId: "",
    category: boardName,
    tags: [],
    url: `https://www.douyin.com/search/${encodeURIComponent(title)}`,
    thumbnail: word.word_cover?.url_list?.[0] ?? "",
    publishedAt: toIso(word.event_time),
    durationSec: 0,
    metrics: {
      views: Number(word.view_count) || 0,
      likes: Number(word.hot_value) || 0, // 热度值作为点赞近似,供下游打分
      favorites: 0,
      shares: 0,
      comments: Number(word.discuss_video_count) || 0
    }
  };
}

// TTD /douyin/hot 返回 data: [{ "抖音热榜": [word...] }, { "娱乐榜": [...] }, ...]
// category 命中某个榜单名则只取该榜;否则合并全部榜单,按 sentence_id 去重。
export function mapTtdHotResponse(raw: unknown, category: string, topN: number): TrendItem[] {
  const data = (raw as { data?: unknown })?.data;
  if (!Array.isArray(data)) {
    return [];
  }
  const items: TrendItem[] = [];
  const seen = new Set<string>();
  for (const board of data) {
    if (!board || typeof board !== "object") {
      continue;
    }
    for (const [boardName, wordList] of Object.entries(board as Record<string, unknown>)) {
      if (category && boardName !== category) {
        continue;
      }
      if (!Array.isArray(wordList)) {
        continue;
      }
      for (const word of wordList as HotWord[]) {
        const mapped = mapHotWord(word, boardName);
        if (!mapped.title || seen.has(mapped.id)) {
          continue;
        }
        seen.add(mapped.id);
        items.push(mapped);
      }
    }
  }
  return items.slice(0, topN);
}

export async function fetchTtdTrends(
  platform: TtdPlatform,
  opts: { category: string; topN: number },
  deps: TtdSourceDeps = {}
): Promise<TrendItem[]> {
  const env = deps.env ?? process.env;
  if (!isTtdConfigured(env)) {
    throw new Error(
      "TikTokDownloader source not configured. Start it (python run_api.py) and set TTD_BASE_URL (e.g. http://127.0.0.1:5555) or TTD_ENABLED=true."
    );
  }
  const url = `${baseUrl(env)}${endpointFor(env)}`;
  const response = await (deps.fetch ?? fetch)(url, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      // is_valid_token() 默认放行,留空即可;若部署端设了 token 可走 env 注入
      token: env.TTD_TOKEN ?? ""
    },
    // 热榜接口可选 cookie(抗风控)/proxy;默认空 body 即可拉到公开热榜
    body: JSON.stringify(env.TTD_DOUYIN_COOKIE ? { cookie: env.TTD_DOUYIN_COOKIE } : {}),
    signal: AbortSignal.timeout(timeoutMs(env))
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`TikTokDownloader ${platform} HTTP ${response.status}: ${text}`);
  }
  const raw = text ? JSON.parse(text) : {};
  return mapTtdHotResponse(raw, opts.category === "hot" ? "" : opts.category, opts.topN);
}

export function createTtdTrendSource(platform: TtdPlatform, deps: TtdSourceDeps = {}): TrendSource {
  return {
    platform,
    fetchTrends: (opts) => fetchTtdTrends(platform, opts, deps)
  };
}

// ── 抖音搜索 / 评论的免费路径 ───────────────────────────────────────────
// 与热榜不同,抖音搜索/评论接口需要登录态(Cookie)抗风控。为避免在没 Cookie 时
// 把能用的 TikHub 路径换成空结果,只有当 TTD_DOUYIN_COOKIE 已配置时才走 TTD 免费路径;
// 否则 research.ts 仍退化到 TikHub。返回原始 JSON,交给上游既有归一化器复用。

const DEFAULT_SEARCH_ENDPOINT = "/douyin/search/video";
const DEFAULT_COMMENT_ENDPOINT = "/douyin/comment";

export function canUseTtdAuthed(env: Record<string, string | undefined> = process.env): boolean {
  return isTtdConfigured(env) && Boolean(env.TTD_DOUYIN_COOKIE?.trim());
}

export function ttdSearchEndpoint(env: Record<string, string | undefined> = process.env): string {
  return env.TTD_DOUYIN_SEARCH_ENDPOINT || DEFAULT_SEARCH_ENDPOINT;
}

export function ttdCommentEndpoint(env: Record<string, string | undefined> = process.env): string {
  return env.TTD_DOUYIN_COMMENT_ENDPOINT || DEFAULT_COMMENT_ENDPOINT;
}

async function postTtdRaw(
  env: Record<string, string | undefined>,
  fetchImpl: typeof fetch,
  endpoint: string,
  body: Record<string, unknown>
): Promise<unknown> {
  const response = await fetchImpl(`${baseUrl(env)}${endpoint}`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      token: env.TTD_TOKEN ?? ""
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs(env))
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`TikTokDownloader HTTP ${response.status}: ${text}`);
  }
  return text ? JSON.parse(text) : {};
}

export async function fetchTtdDouyinSearchRaw(
  query: string,
  limit: number,
  deps: TtdSourceDeps = {}
): Promise<unknown> {
  const env = deps.env ?? process.env;
  return postTtdRaw(env, deps.fetch ?? fetch, ttdSearchEndpoint(env), {
    keyword: query,
    offset: 0,
    count: limit,
    source: true, // 返回抖音原始字段,复用 mapTikHubTrendResponse 归一化
    cookie: env.TTD_DOUYIN_COOKIE ?? ""
  });
}

export async function fetchTtdDouyinCommentsRaw(
  detailId: string,
  limit: number,
  deps: TtdSourceDeps = {}
): Promise<unknown> {
  const env = deps.env ?? process.env;
  return postTtdRaw(env, deps.fetch ?? fetch, ttdCommentEndpoint(env), {
    detail_id: detailId,
    cursor: 0,
    count: Math.min(limit, 20),
    source: true,
    cookie: env.TTD_DOUYIN_COOKIE ?? ""
  });
}
