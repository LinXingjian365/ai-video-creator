import type { Platform, TrendItem, TrendSource } from "../types";

type TikHubPlatform = Extract<Platform, "douyin" | "kuaishou">;

interface TikHubSourceDeps {
  env?: Record<string, string | undefined>;
  fetch?: typeof fetch;
}

const DEFAULT_BASE_URL = "https://api.tikhub.io";
const DEFAULT_TIMEOUT_MS = 15000;

const DEFAULT_ENDPOINTS: Record<TikHubPlatform, string> = {
  douyin: "/api/v1/douyin/web/fetch_hot_search_result",
  kuaishou: "/api/v1/kuaishou/web/fetch_kuaishou_hot_list_v2"
};

const KUAISHOU_BOARD_TYPES: Record<string, string> = {
  all: "1",
  hot: "1",
  entertainment: "2",
  society: "3",
  useful: "4",
  challenge: "5",
  search: "6"
};

function timeoutMs(env: Record<string, string | undefined>) {
  const parsed = Number(env.TIKHUB_TIMEOUT_MS ?? DEFAULT_TIMEOUT_MS);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_TIMEOUT_MS;
}

function endpointFor(platform: TikHubPlatform, env: Record<string, string | undefined>) {
  return env[`TIKHUB_ENDPOINT_${platform.toUpperCase()}`] || DEFAULT_ENDPOINTS[platform];
}

function buildTikHubUrl(platform: TikHubPlatform, category: string, env: Record<string, string | undefined>) {
  const endpoint = endpointFor(platform, env);
  const base = (env.TIKHUB_BASE_URL || DEFAULT_BASE_URL).replace(/\/+$/, "");
  const url = new URL(endpoint, endpoint.startsWith("http") ? undefined : `${base}/`);
  if (platform === "kuaishou") {
    url.searchParams.set("board_type", KUAISHOU_BOARD_TYPES[category] ?? (Number.isInteger(Number(category)) ? category : "1"));
  }
  return url;
}

export async function fetchTikHubTrends(
  platform: TikHubPlatform,
  opts: { category: string; topN: number },
  deps: TikHubSourceDeps = {}
): Promise<TrendItem[]> {
  const env = deps.env ?? process.env;
  const token = env.TIKHUB_API_KEY;
  if (!token) {
    throw new Error(`${platform} trend source requires TIKHUB_API_KEY. Configure TikHub before fetching real ${platform} trends.`);
  }

  const url = buildTikHubUrl(platform, opts.category, env);
  const response = await (deps.fetch ?? fetch)(url, {
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${token}`
    },
    signal: AbortSignal.timeout(timeoutMs(env))
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`TikHub ${platform} HTTP ${response.status}: ${text}`);
  }

  const raw = text ? JSON.parse(text) : {};
  return mapTikHubTrendResponse(raw, platform, opts.category).slice(0, opts.topN);
}

export function createTikHubTrendSource(platform: TikHubPlatform, deps: TikHubSourceDeps = {}): TrendSource {
  return {
    platform,
    fetchTrends: (opts) => fetchTikHubTrends(platform, opts, deps)
  };
}

export function mapTikHubTrendResponse(raw: unknown, platform: TikHubPlatform, category: string): TrendItem[] {
  const array = findTrendArray(raw);
  if (!array.length) {
    throw new Error(`TikHub ${platform} response does not contain a trend item array.`);
  }

  return array
    .map((value, index) => normalizeTikHubItem(asRecord(value), platform, category, index))
    .filter((item) => item.title);
}

function findTrendArray(raw: unknown): Record<string, unknown>[] {
  if (Array.isArray(raw)) {
    return raw.filter(isRecord);
  }
  const root = asRecord(raw);
  const paths = [
    ["data"],
    ["data", "list"],
    ["data", "items"],
    ["data", "word_list"],
    ["data", "hot_list"],
    ["data", "result"],
    ["data", "result", "list"],
    ["data", "data"],
    ["data", "data", "list"],
    ["result"],
    ["result", "list"],
    ["items"],
    ["list"]
  ];

  for (const path of paths) {
    const value = getPath(root, path);
    if (Array.isArray(value)) {
      return value.filter(isRecord);
    }
  }

  return findFirstObjectArray(root) ?? [];
}

function findFirstObjectArray(value: unknown, seen = new Set<unknown>()): Record<string, unknown>[] | null {
  if (!isRecord(value) || seen.has(value)) {
    return null;
  }
  seen.add(value);
  for (const child of Object.values(value)) {
    if (Array.isArray(child) && child.some(isRecord)) {
      return child.filter(isRecord);
    }
    const nested = findFirstObjectArray(child, seen);
    if (nested) {
      return nested;
    }
  }
  return null;
}

function normalizeTikHubItem(
  item: Record<string, unknown>,
  platform: TikHubPlatform,
  category: string,
  index: number
): TrendItem {
  const id = firstString(item, ["id", "aweme_id", "item_id", "video_id", "photoId", "photo_id", "workId", "word", "sentence", "hotword"]) || `${platform}-${index + 1}`;
  const title = firstString(item, ["title", "desc", "description", "caption", "hotword", "word", "sentence", "name", "query"]) || id;
  const author = firstString(item, ["author", "nickname", "user_name", "owner", "source"]) || firstString(asRecord(item.author), ["nickname", "name", "unique_id"]) || "";
  const authorId = firstString(item, ["author_id", "uid", "user_id", "sec_uid"]) || firstString(asRecord(item.author), ["uid", "id", "sec_uid"]) || "";
  const url = firstString(item, ["url", "share_url", "shareUrl", "web_url", "video_url"]) || defaultSearchUrl(platform, title, id);
  const thumbnail = firstString(item, ["thumbnail", "cover", "cover_url", "pic", "image"]) || firstString(asRecord(item.video), ["cover", "cover_url"]) || "";

  return {
    platform,
    id,
    title,
    author,
    authorId,
    category: firstString(item, ["category", "board_name", "type", "tag"]) || category,
    tags: readTags(item),
    url,
    thumbnail,
    publishedAt: readDate(item),
    durationSec: readDurationSec(item),
    metrics: {
      views: firstNumber(item, ["views", "view_count", "play_count", "playCount", "hot_value", "hotValue", "heat", "score"]),
      likes: firstNumber(item, ["likes", "like_count", "digg_count", "diggCount"]),
      favorites: firstNumber(item, ["favorites", "favorite_count", "collect_count", "collectCount"]),
      shares: firstNumber(item, ["shares", "share_count", "shareCount"]),
      comments: firstNumber(item, ["comments", "comment_count", "commentCount"]),
      danmaku: firstNumber(item, ["danmaku", "danmaku_count", "bullet_count"])
    }
  };
}

function defaultSearchUrl(platform: TikHubPlatform, title: string, id: string) {
  if (/^\d+$/.test(id) && platform === "douyin") {
    return `https://www.douyin.com/video/${id}`;
  }
  if (platform === "kuaishou" && id && !id.startsWith("kuaishou-")) {
    return `https://www.kuaishou.com/short-video/${id}`;
  }
  const encoded = encodeURIComponent(title);
  return platform === "douyin" ? `https://www.douyin.com/search/${encoded}` : `https://www.kuaishou.com/search/video?searchKey=${encoded}`;
}

function readDate(item: Record<string, unknown>) {
  const raw = firstUnknown(item, ["publishedAt", "publish_time", "create_time", "createTime", "timestamp", "time_stamp"]);
  if (typeof raw === "string" && raw) {
    const numeric = Number(raw);
    if (Number.isFinite(numeric)) {
      return timestampToIso(numeric);
    }
    const date = new Date(raw);
    return Number.isNaN(date.getTime()) ? new Date(0).toISOString() : date.toISOString();
  }
  if (typeof raw === "number") {
    return timestampToIso(raw);
  }
  return new Date(0).toISOString();
}

function timestampToIso(value: number) {
  return new Date(value > 10_000_000_000 ? value : value * 1000).toISOString();
}

function readDurationSec(item: Record<string, unknown>) {
  const duration = firstNumber(item, ["duration", "durationSec", "duration_sec"]);
  if (duration > 1000) {
    return Math.round(duration / 1000);
  }
  const durationMs = firstNumber(item, ["duration_ms", "durationMs"]);
  return durationMs ? Math.round(durationMs / 1000) : duration;
}

function readTags(item: Record<string, unknown>) {
  const value = firstUnknown(item, ["tags", "hashtags", "topics"]);
  if (Array.isArray(value)) {
    return value.map((tag) => typeof tag === "string" ? tag : firstString(asRecord(tag), ["name", "title", "tag"])).filter(Boolean);
  }
  const title = firstString(item, ["word", "hotword", "sentence"]);
  return title ? [title] : [];
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

function firstUnknown(item: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    if (item[key] !== undefined && item[key] !== null) {
      return item[key];
    }
  }
  return undefined;
}

function getPath(root: Record<string, unknown>, path: string[]) {
  return path.reduce<unknown>((value, key) => isRecord(value) ? value[key] : undefined, root);
}

function asRecord(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
