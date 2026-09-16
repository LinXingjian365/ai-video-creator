import type { TrendItem, TrendSource } from "../types";

const RID_BY_CATEGORY: Record<string, number> = {
  all: 0,
  animation: 1,
  game: 4,
  knowledge: 36,
  life: 160,
  music: 3,
  tech: 188,
  movie: 23,
  dance: 129,
  food: 211
};

export function ridForCategory(category: string): number {
  if (category in RID_BY_CATEGORY) {
    return RID_BY_CATEGORY[category];
  }

  const rid = Number(category);
  return Number.isInteger(rid) && rid >= 0 ? rid : 0;
}

interface RankingEntry {
  bvid: string;
  title: string;
  owner: { name: string; mid: number };
  stat: {
    view: number;
    danmaku: number;
    reply: number;
    favorite: number;
    coin: number;
    share: number;
    like: number;
  };
  duration: number;
  pubdate: number;
  pic: string;
  tname?: string;
}

interface BilibiliResponse {
  code?: number;
  message?: string;
  data?: {
    list?: RankingEntry[];
  };
}

const DEFAULT_FETCH_TIMEOUT_MS = 10000;

function fetchTimeoutMs(): number {
  const parsed = Number(process.env.BILI_TIMEOUT_MS ?? DEFAULT_FETCH_TIMEOUT_MS);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_FETCH_TIMEOUT_MS;
}

export function mapRankingResponse(raw: unknown): TrendItem[] {
  const response = raw as BilibiliResponse;

  if (!response || response.code !== 0 || !response.data?.list) {
    throw new Error(`Bilibili ranking response is invalid: code=${response?.code}, message=${response?.message ?? "unknown"}`);
  }

  return mapEntries(response.data.list);
}

function mapEntries(entries: RankingEntry[]): TrendItem[] {
  return entries.map((entry) => ({
    platform: "bilibili" as const,
    id: entry.bvid,
    title: entry.title,
    author: entry.owner?.name ?? "",
    authorId: String(entry.owner?.mid ?? ""),
    category: entry.tname ?? "",
    tags: [],
    url: `https://www.bilibili.com/video/${entry.bvid}`,
    thumbnail: entry.pic ?? "",
    publishedAt: new Date((entry.pubdate ?? 0) * 1000).toISOString(),
    durationSec: entry.duration ?? 0,
    metrics: {
      views: entry.stat?.view ?? 0,
      likes: entry.stat?.like ?? 0,
      coins: entry.stat?.coin ?? 0,
      favorites: entry.stat?.favorite ?? 0,
      shares: entry.stat?.share ?? 0,
      comments: entry.stat?.reply ?? 0,
      danmaku: entry.stat?.danmaku ?? 0
    }
  }));
}

function requestHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    "Accept": "application/json, text/plain, */*",
    "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
    "Origin": "https://www.bilibili.com",
    "Referer": "https://www.bilibili.com/",
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36"
  };

  if (process.env.BILI_COOKIE) {
    headers.Cookie = process.env.BILI_COOKIE;
  }

  return headers;
}

async function fetchJson(url: string, label: string, attempt = 0): Promise<unknown> {
  try {
    const response = await fetch(url, {
      headers: requestHeaders(),
      signal: AbortSignal.timeout(fetchTimeoutMs())
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    return await response.json();
  } catch (error) {
    if (attempt < 2) {
      await new Promise((resolve) => setTimeout(resolve, 500 * 2 ** attempt));
      return fetchJson(url, label, attempt + 1);
    }

    throw new Error(`${label} fetch failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function fetchRanking(rid: number): Promise<unknown> {
  const url = `https://api.bilibili.com/x/web-interface/ranking/v2?rid=${rid}&type=all`;
  return fetchJson(url, `Bilibili ranking rid=${rid}`);
}

async function fetchPopular(topN: number): Promise<unknown> {
  const url = `https://api.bilibili.com/x/web-interface/popular?ps=${Math.min(Math.max(topN, 1), 50)}&pn=1`;
  return fetchJson(url, "Bilibili popular");
}

export function mapPopularResponse(raw: unknown): TrendItem[] {
  const response = raw as BilibiliResponse;

  if (!response || response.code !== 0 || !response.data?.list) {
    throw new Error(`Bilibili popular response is invalid: code=${response?.code}, message=${response?.message ?? "unknown"}`);
  }

  return mapEntries(response.data.list);
}

export const bilibiliSource: TrendSource = {
  platform: "bilibili",
  async fetchTrends({ category, topN }) {
    const rid = ridForCategory(category);
    try {
      const raw = await fetchRanking(rid);
      return mapRankingResponse(raw).slice(0, topN);
    } catch (error) {
      if (rid !== 0) {
        throw new Error(`${error instanceof Error ? error.message : String(error)}. If Bilibili blocks the request, add BILI_COOKIE to .env.local.`);
      }

      const raw = await fetchPopular(topN);
      return mapPopularResponse(raw).slice(0, topN);
    }
  }
};
