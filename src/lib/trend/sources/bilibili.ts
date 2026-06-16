import type { TrendItem, TrendSource } from "../types";

const RID_BY_CATEGORY: Record<string, number> = {
  all: 0, animation: 1, game: 4, knowledge: 36, life: 160,
  music: 3, tech: 188, movie: 23, dance: 129, food: 211,
};

export function ridForCategory(category: string): number {
  if (category in RID_BY_CATEGORY) return RID_BY_CATEGORY[category];
  const n = Number(category);
  return Number.isInteger(n) && n >= 0 ? n : 0;
}

interface RankingEntry {
  bvid: string; title: string;
  owner: { name: string; mid: number };
  stat: { view: number; danmaku: number; reply: number; favorite: number; coin: number; share: number; like: number };
  duration: number; pubdate: number; pic: string; tname?: string;
}

export function mapRankingResponse(raw: unknown): TrendItem[] {
  const r = raw as { code?: number; data?: { list?: RankingEntry[] } };
  if (!r || r.code !== 0 || !r.data?.list) {
    throw new Error(`B站排行榜返回异常: code=${r?.code}`);
  }
  return r.data.list.map((e) => ({
    platform: "bilibili" as const,
    id: e.bvid,
    title: e.title,
    author: e.owner?.name ?? "",
    authorId: String(e.owner?.mid ?? ""),
    category: e.tname ?? "",
    tags: [],
    url: `https://www.bilibili.com/video/${e.bvid}`,
    thumbnail: e.pic ?? "",
    publishedAt: new Date((e.pubdate ?? 0) * 1000).toISOString(),
    durationSec: e.duration ?? 0,
    metrics: {
      views: e.stat?.view ?? 0,
      likes: e.stat?.like ?? 0,
      coins: e.stat?.coin ?? 0,
      favorites: e.stat?.favorite ?? 0,
      shares: e.stat?.share ?? 0,
      comments: e.stat?.reply ?? 0,
      danmaku: e.stat?.danmaku ?? 0,
    },
  }));
}

const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
  Referer: "https://www.bilibili.com",
};

async function fetchRanking(rid: number, attempt = 0): Promise<unknown> {
  const url = `https://api.bilibili.com/x/web-interface/ranking/v2?rid=${rid}&type=all`;
  try {
    const res = await fetch(url, { headers: HEADERS });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (error) {
    if (attempt < 2) {
      await new Promise((r) => setTimeout(r, 500 * 2 ** attempt));
      return fetchRanking(rid, attempt + 1);
    }
    throw new Error(`B站排行榜抓取失败(rid=${rid}): ${error instanceof Error ? error.message : String(error)}`);
  }
}

export const bilibiliSource: TrendSource = {
  platform: "bilibili",
  async fetchTrends({ category, topN }) {
    const raw = await fetchRanking(ridForCategory(category));
    return mapRankingResponse(raw).slice(0, topN);
  },
};
