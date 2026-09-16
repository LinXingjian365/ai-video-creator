// Self-hosted KS-Downloader (JoeanAmier, Apache 2.0) adapter.
// It does not expose a verified Kuaishou hot-list endpoint, so this file only
// covers detail lookup for reference videos. Trend hot lists still use TikHub.

import type { TrendItem } from "../types";

interface KsdSourceDeps {
  env?: Record<string, string | undefined>;
  fetch?: typeof fetch;
}

export interface KsdDetailInput {
  url?: string;
  itemId?: string;
}

const DEFAULT_BASE_URL = "http://127.0.0.1:5557";
const DEFAULT_DETAIL_ENDPOINT = "/detail/";
const DEFAULT_TIMEOUT_MS = 30000;

function baseUrl(env: Record<string, string | undefined>) {
  return (env.KSD_BASE_URL || DEFAULT_BASE_URL).replace(/\/+$/, "");
}

export function ksdDetailEndpoint(env: Record<string, string | undefined>) {
  return env.KSD_DETAIL_ENDPOINT || DEFAULT_DETAIL_ENDPOINT;
}

function timeoutMs(env: Record<string, string | undefined>) {
  const parsed = Number(env.KSD_TIMEOUT_MS ?? DEFAULT_TIMEOUT_MS);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_TIMEOUT_MS;
}

export function isKsdConfigured(env: Record<string, string | undefined> = process.env): boolean {
  return Boolean(env.KSD_BASE_URL || env.KSD_ENABLED === "true");
}

export function buildKsdDetailText(input: KsdDetailInput) {
  if (input.url?.trim()) {
    return input.url.trim();
  }
  const itemId = input.itemId?.trim();
  return itemId ? `https://www.kuaishou.com/short-video/${encodeURIComponent(itemId)}` : "";
}

export async function fetchKsdDetail(input: KsdDetailInput, deps: KsdSourceDeps = {}): Promise<TrendItem> {
  const env = deps.env ?? process.env;
  if (!isKsdConfigured(env)) {
    throw new Error("KS-Downloader source not configured. Start it and set KSD_BASE_URL (for example http://127.0.0.1:5557) or KSD_ENABLED=true.");
  }

  const textInput = buildKsdDetailText(input);
  if (!textInput) {
    throw new Error("KS-Downloader detail requires url or itemId.");
  }

  const endpoint = ksdDetailEndpoint(env);
  const response = await (deps.fetch ?? fetch)(`${baseUrl(env)}${endpoint}`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      text: textInput,
      cookie: env.KSD_COOKIE ?? "",
      proxy: env.KSD_PROXY ?? ""
    }),
    signal: AbortSignal.timeout(timeoutMs(env))
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`KS-Downloader kuaishou HTTP ${response.status}: ${text}`);
  }

  return mapKsdDetailResponse(text ? JSON.parse(text) : {}, textInput);
}

export function mapKsdDetailResponse(raw: unknown, fallbackUrl = ""): TrendItem {
  const root = asRecord(raw);
  const data = isRecord(root.data) ? root.data : root;
  const id = firstString(data, ["detailID", "photoId", "photo_id", "id", "workId"]) || idFromUrl(fallbackUrl) || "kuaishou-detail";
  const title = firstString(data, ["caption", "title", "desc", "description"]) || id;
  const author = firstString(data, ["name", "userName", "nickname", "author"]);
  const authorId = firstString(data, ["authorID", "userId", "user_id", "authorId"]);
  const thumbnail = firstString(data, ["coverUrl", "cover", "thumbnail"])
    || firstArrayString(data, ["coverUrls", "webpCoverUrls", "headUrls"]);

  return {
    platform: "kuaishou",
    id,
    title,
    author,
    authorId,
    category: "detail",
    tags: [],
    url: firstString(data, ["shareUrl", "url", "webUrl"]) || defaultKuaishouUrl(id),
    thumbnail,
    publishedAt: readDate(data),
    durationSec: readDurationSec(data),
    metrics: {
      views: firstNumber(data, ["viewCount", "playCount", "view_count", "play_count"]),
      likes: firstNumber(data, ["realLikeCount", "likeCount", "like_count", "likes"]),
      favorites: 0,
      shares: firstNumber(data, ["shareCount", "share_count", "shares"]),
      comments: firstNumber(data, ["commentCount", "comment_count", "comments"])
    }
  };
}

function defaultKuaishouUrl(id: string) {
  return `https://www.kuaishou.com/short-video/${encodeURIComponent(id)}`;
}

function idFromUrl(value: string) {
  const match = value.match(/short-video\/([^/?#]+)/i);
  return match?.[1] ? decodeURIComponent(match[1]) : "";
}

function readDurationSec(item: Record<string, unknown>) {
  const numeric = firstNumber(item, ["duration", "durationSec", "duration_sec"]);
  if (numeric > 1000) {
    return Math.round(numeric / 1000);
  }
  const durationText = firstString(item, ["durationText", "duration_text"]);
  const hms = durationText || firstString(item, ["durationString", "duration"]);
  const match = hms.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (!match) {
    return numeric;
  }
  const first = Number(match[1]);
  const second = Number(match[2]);
  const third = Number(match[3] ?? 0);
  return match[3] ? first * 3600 + second * 60 + third : first * 60 + second;
}

function readDate(item: Record<string, unknown>) {
  const raw = item.timestamp ?? item.createTime ?? item.create_time ?? item.publishTime;
  if (typeof raw === "number") {
    return new Date(raw > 10_000_000_000 ? raw : raw * 1000).toISOString();
  }
  if (typeof raw === "string" && raw) {
    const normalized = raw.includes("_") ? raw.replace("_", " ") : raw;
    const numeric = Number(normalized);
    if (Number.isFinite(numeric)) {
      return new Date(numeric > 10_000_000_000 ? numeric : numeric * 1000).toISOString();
    }
    const parsed = new Date(normalized);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toISOString();
    }
  }
  return new Date(0).toISOString();
}

function asRecord(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function firstString(item: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = item[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
    if (typeof value === "number" && Number.isFinite(value)) {
      return String(value);
    }
  }
  return "";
}

function firstArrayString(item: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = item[key];
    if (Array.isArray(value)) {
      const stringValue = value.find((entry) => typeof entry === "string" && entry.trim());
      if (stringValue) {
        return stringValue;
      }
    }
  }
  return "";
}

function firstNumber(item: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = item[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
    if (typeof value === "string") {
      const parsed = Number(value.replace(/,/g, ""));
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
  }
  return 0;
}
