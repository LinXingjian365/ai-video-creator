import type { TrendItem, TrendSource } from "../types";

interface YoutubeThumbnails {
  default?: { url?: string };
  medium?: { url?: string };
  high?: { url?: string };
}

interface YoutubeVideo {
  id?: string;
  snippet?: {
    title?: string;
    channelTitle?: string;
    channelId?: string;
    categoryId?: string;
    tags?: string[];
    publishedAt?: string;
    thumbnails?: YoutubeThumbnails;
  };
  statistics?: {
    viewCount?: string;
    likeCount?: string;
    favoriteCount?: string;
    commentCount?: string;
  };
  contentDetails?: { duration?: string };
}

interface YoutubeResponse {
  items?: YoutubeVideo[];
  error?: { message?: string };
}

const DEFAULT_FETCH_TIMEOUT_MS = 10000;

function fetchTimeoutMs(): number {
  const parsed = Number(process.env.YOUTUBE_TIMEOUT_MS ?? DEFAULT_FETCH_TIMEOUT_MS);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_FETCH_TIMEOUT_MS;
}

export function parseIsoDuration(iso: string): number {
  const match = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(iso ?? "");
  if (!match) {
    return 0;
  }
  const [, hours, minutes, seconds] = match;
  return Number(hours ?? 0) * 3600 + Number(minutes ?? 0) * 60 + Number(seconds ?? 0);
}

export function mapYoutubeResponse(raw: unknown): TrendItem[] {
  const response = raw as YoutubeResponse;
  if (!response || response.error) {
    throw new Error(`YouTube API error: ${response?.error?.message ?? "unknown"}`);
  }
  if (!Array.isArray(response.items)) {
    throw new Error("YouTube response missing items array");
  }

  return response.items.map((video) => {
    const thumbs = video.snippet?.thumbnails;
    return {
      platform: "youtube" as const,
      id: video.id ?? "",
      title: video.snippet?.title ?? "",
      author: video.snippet?.channelTitle ?? "",
      authorId: video.snippet?.channelId ?? "",
      category: video.snippet?.categoryId ?? "",
      tags: video.snippet?.tags ?? [],
      url: `https://www.youtube.com/watch?v=${video.id ?? ""}`,
      thumbnail: thumbs?.medium?.url ?? thumbs?.high?.url ?? thumbs?.default?.url ?? "",
      publishedAt: video.snippet?.publishedAt ?? new Date(0).toISOString(),
      durationSec: parseIsoDuration(video.contentDetails?.duration ?? ""),
      metrics: {
        views: Number(video.statistics?.viewCount ?? 0),
        likes: Number(video.statistics?.likeCount ?? 0),
        favorites: Number(video.statistics?.favoriteCount ?? 0),
        shares: 0,
        comments: Number(video.statistics?.commentCount ?? 0)
      }
    };
  });
}

export const youtubeSource: TrendSource = {
  platform: "youtube",
  async fetchTrends({ category, topN }) {
    const key = process.env.YOUTUBE_API_KEY;
    if (!key) {
      throw new Error(
        "YouTube 热点需要 YOUTUBE_API_KEY(YouTube Data API v3)。YouTube 已下线免登录的 Trending 页,只能走官方 API。在 .env.local 配置 YOUTUBE_API_KEY(可选 YOUTUBE_REGION)后重试。"
      );
    }
    const region = process.env.YOUTUBE_REGION ?? "US";
    const params = new URLSearchParams({
      part: "snippet,statistics,contentDetails",
      chart: "mostPopular",
      maxResults: String(Math.min(Math.max(topN, 1), 50)),
      regionCode: region,
      key
    });
    if (/^\d+$/.test(category)) {
      params.set("videoCategoryId", category);
    }
    const url = `https://www.googleapis.com/youtube/v3/videos?${params.toString()}`;

    const response = await fetch(url, { signal: AbortSignal.timeout(fetchTimeoutMs()) });
    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as YoutubeResponse | null;
      throw new Error(`YouTube API HTTP ${response.status}: ${body?.error?.message ?? response.statusText}`);
    }
    return mapYoutubeResponse(await response.json()).slice(0, topN);
  }
};
