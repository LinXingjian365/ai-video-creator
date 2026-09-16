import { mapTikHubTrendResponse } from "@/lib/trend/sources/tikhub";
import { buildKsdDetailText, fetchKsdDetail, isKsdConfigured, ksdDetailEndpoint } from "@/lib/trend/sources/ks-downloader";
import {
  canUseTtdAuthed,
  fetchTtdDouyinCommentsRaw,
  fetchTtdDouyinSearchRaw,
  ttdCommentEndpoint,
  ttdSearchEndpoint
} from "@/lib/trend/sources/tiktok-downloader";
import type { Platform, TrendItem } from "@/lib/trend/types";

export type ResearchPlatform = Extract<Platform, "douyin" | "kuaishou">;

export interface TikHubResearchInput {
  platform: ResearchPlatform;
  query?: string;
  url?: string;
  itemId?: string;
  includeComments?: boolean;
  limit?: number;
}

export interface ResearchEndpointCall {
  kind: "search" | "detail" | "comments";
  endpoint: string;
  params: Record<string, string>;
}

export interface ResearchComment {
  id: string;
  author: string;
  text: string;
  likes: number;
  replies: number;
  publishedAt: string;
}

export interface ResearchMaterialCandidate {
  title: string;
  url: string;
  platform: ResearchPlatform;
  reason: string;
  source: "search" | "detail";
}

export interface TikHubResearchReport {
  platform: ResearchPlatform;
  generatedAt: string;
  query?: string;
  url?: string;
  itemId?: string;
  endpointCalls: ResearchEndpointCall[];
  searchItems: TrendItem[];
  detail?: TrendItem;
  comments: ResearchComment[];
  materialCandidates: ResearchMaterialCandidate[];
  nextActions: string[];
}

interface TikHubResearchDeps {
  env?: Record<string, string | undefined>;
  fetch?: typeof fetch;
  now?: () => Date;
}

const DEFAULT_BASE_URL = "https://api.tikhub.io";
const DEFAULT_TIMEOUT_MS = 15000;
const DEFAULT_LIMIT = 10;

const DEFAULT_ENDPOINTS = {
  douyinSearch: "/api/v1/douyin/app/v3/fetch_video_search_result",
  douyinDetailByUrl: "/api/v1/hybrid/video_data",
  douyinDetailById: "/api/v1/douyin/app/v3/fetch_one_video",
  douyinComments: "/api/v1/douyin/app/v3/fetch_video_comments",
  kuaishouSearch: "/api/v1/kuaishou/app/search_video_v2",
  kuaishouDetailByUrl: "/api/v1/kuaishou/app/fetch_one_video_by_url",
  kuaishouDetailById: "/api/v1/kuaishou/app/fetch_one_video",
  kuaishouComments: "/api/v1/kuaishou/app/fetch_one_video_comment"
};

export async function runTikHubResearch(input: TikHubResearchInput, deps: TikHubResearchDeps = {}): Promise<TikHubResearchReport> {
  const env = deps.env ?? process.env;
  const token = env.TIKHUB_API_KEY;
  if (!input.query?.trim() && !input.url?.trim() && !input.itemId?.trim()) {
    throw new Error("Provide query, url, or itemId for TikHub research.");
  }

  const wantsDetail = Boolean(input.url?.trim() || input.itemId?.trim());
  const canUseKsdDetail = input.platform === "kuaishou" && wantsDetail && isKsdConfigured(env);
  // 抖音 search/comment 在配了 TTD Cookie 时走 TTD 免费路径,否则 TikHub
  const ttdAuthed = input.platform === "douyin" && canUseTtdAuthed(env);
  const needsTikHubSearch = Boolean(input.query?.trim()) && !ttdAuthed;
  const needsTikHubDetail = wantsDetail && !canUseKsdDetail;
  const needsTikHub = needsTikHubSearch || needsTikHubDetail;
  if (needsTikHub && !token) {
    throw new Error("TikHub research requires TIKHUB_API_KEY for search or TikHub detail. For free Douyin search/comments start TikTokDownloader and set TTD_DOUYIN_COOKIE; for free Kuaishou detail start KS-Downloader and set KSD_BASE_URL or KSD_ENABLED=true.");
  }

  const limit = clampLimit(input.limit);
  const endpointCalls: ResearchEndpointCall[] = [];
  const searchItems = input.query?.trim()
    ? await callSearch(input.platform, input.query.trim(), limit, env, token, deps.fetch, endpointCalls)
    : [];
  const detail = input.url?.trim() || input.itemId?.trim()
    ? await callDetail(input.platform, { url: input.url?.trim(), itemId: input.itemId?.trim() }, env, token, deps.fetch, endpointCalls)
    : undefined;
  const commentsItemId = input.itemId?.trim() || detail?.id;
  const canUseTtdComments = ttdAuthed && Boolean(commentsItemId);
  const comments = input.includeComments && commentsItemId && (token || canUseTtdComments)
    ? await callComments(input.platform, commentsItemId, limit, env, token, deps.fetch, endpointCalls)
    : [];

  return {
    platform: input.platform,
    generatedAt: (deps.now?.() ?? new Date()).toISOString(),
    query: input.query?.trim() || undefined,
    url: input.url?.trim() || undefined,
    itemId: input.itemId?.trim() || undefined,
    endpointCalls,
    searchItems,
    detail,
    comments,
    materialCandidates: buildMaterialCandidates(input.platform, searchItems, detail).slice(0, limit),
    nextActions: buildNextActions({
      searchItems,
      detail,
      comments,
      includeComments: Boolean(input.includeComments),
      skippedCommentsForMissingTikHubKey: Boolean(input.includeComments && commentsItemId && !token && !canUseTtdComments)
    })
  };
}

async function callSearch(
  platform: ResearchPlatform,
  query: string,
  limit: number,
  env: Record<string, string | undefined>,
  token: string | undefined,
  fetchImpl: typeof fetch | undefined,
  endpointCalls: ResearchEndpointCall[]
) {
  if (platform === "douyin" && canUseTtdAuthed(env)) {
    const endpoint = ttdSearchEndpoint(env);
    endpointCalls.push({ kind: "search", endpoint, params: { keyword: query, count: String(limit), source: "ttd" } });
    const raw = await fetchTtdDouyinSearchRaw(query, limit, { env, fetch: fetchImpl });
    return mapTikHubTrendResponse(raw, platform, "search").slice(0, limit);
  }
  const endpoint = endpointFor(platform === "douyin" ? "douyinSearch" : "kuaishouSearch", env);
  const params: Record<string, string> = platform === "douyin"
    ? { keyword: query, offset: "0", count: String(limit) }
    : { keyword: query, pcursor: "" };
  endpointCalls.push({ kind: "search", endpoint, params });
  const raw = await requestTikHub(endpoint, params, env, requireTikHubToken(token), fetchImpl);
  return mapTikHubTrendResponse(raw, platform, "search").slice(0, limit);
}

async function callDetail(
  platform: ResearchPlatform,
  input: { url?: string; itemId?: string },
  env: Record<string, string | undefined>,
  token: string | undefined,
  fetchImpl: typeof fetch | undefined,
  endpointCalls: ResearchEndpointCall[]
) {
  if (platform === "kuaishou" && isKsdConfigured(env)) {
    const endpoint = ksdDetailEndpoint(env);
    const params = { text: buildKsdDetailText(input) };
    endpointCalls.push({ kind: "detail", endpoint, params });
    return fetchKsdDetail(input, { env, fetch: fetchImpl });
  }

  const key = platform === "douyin"
    ? input.url ? "douyinDetailByUrl" : "douyinDetailById"
    : input.url ? "kuaishouDetailByUrl" : "kuaishouDetailById";
  const endpoint = endpointFor(key, env);
  const params: Record<string, string> = buildDetailParams(platform, input);
  endpointCalls.push({ kind: "detail", endpoint, params });
  const raw = await requestTikHub(endpoint, params, env, requireTikHubToken(token), fetchImpl);
  return normalizeSingleItem(raw, platform, "detail");
}

async function callComments(
  platform: ResearchPlatform,
  itemId: string,
  limit: number,
  env: Record<string, string | undefined>,
  token: string | undefined,
  fetchImpl: typeof fetch | undefined,
  endpointCalls: ResearchEndpointCall[]
) {
  if (platform === "douyin" && canUseTtdAuthed(env)) {
    const endpoint = ttdCommentEndpoint(env);
    endpointCalls.push({ kind: "comments", endpoint, params: { detail_id: itemId, count: String(Math.min(limit, 20)), source: "ttd" } });
    const raw = await fetchTtdDouyinCommentsRaw(itemId, limit, { env, fetch: fetchImpl });
    return normalizeComments(raw).slice(0, limit);
  }
  const endpoint = endpointFor(platform === "douyin" ? "douyinComments" : "kuaishouComments", env);
  const params: Record<string, string> = platform === "douyin"
    ? { aweme_id: itemId, cursor: "0", count: String(Math.min(limit, 20)) }
    : { photo_id: itemId, pcursor: "", count: String(Math.min(limit, 20)) };
  endpointCalls.push({ kind: "comments", endpoint, params });
  const raw = await requestTikHub(endpoint, params, env, requireTikHubToken(token), fetchImpl);
  return normalizeComments(raw).slice(0, limit);
}

async function requestTikHub(
  endpoint: string,
  params: Record<string, string>,
  env: Record<string, string | undefined>,
  token: string,
  fetchImpl = fetch
) {
  const url = buildUrl(endpoint, params, env);
  const response = await fetchImpl(url, {
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${token}`
    },
    signal: AbortSignal.timeout(timeoutMs(env))
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`TikHub research HTTP ${response.status}: ${text}`);
  }
  return text ? JSON.parse(text) : {};
}

function buildUrl(endpoint: string, params: Record<string, string>, env: Record<string, string | undefined>) {
  const base = (env.TIKHUB_BASE_URL || DEFAULT_BASE_URL).replace(/\/+$/, "");
  const url = new URL(endpoint, endpoint.startsWith("http") ? undefined : `${base}/`);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) {
      url.searchParams.set(key, value);
    }
  }
  return url;
}

function endpointFor(key: keyof typeof DEFAULT_ENDPOINTS, env: Record<string, string | undefined>) {
  return env[`TIKHUB_ENDPOINT_${snakeKey(key)}`] || DEFAULT_ENDPOINTS[key];
}

function requireTikHubToken(token: string | undefined): string {
  if (!token) {
    throw new Error("TikHub research requires TIKHUB_API_KEY.");
  }
  return token;
}

function snakeKey(value: string) {
  return value.replace(/[A-Z]/g, (match) => `_${match}`).toUpperCase();
}

function buildDetailParams(platform: ResearchPlatform, input: { url?: string; itemId?: string }): Record<string, string> {
  if (input.url) {
    return platform === "douyin" ? { url: input.url } : { share_text: input.url };
  }
  const itemId = input.itemId ?? "";
  return platform === "douyin" ? { aweme_id: itemId } : { photo_id: itemId };
}

function normalizeSingleItem(raw: unknown, platform: ResearchPlatform, category: string) {
  try {
    return mapTikHubTrendResponse(raw, platform, category)[0];
  } catch {
    const candidate = firstObject(raw);
    if (!candidate) {
      throw new Error(`TikHub ${platform} detail response does not contain a video object.`);
    }
    return mapTikHubTrendResponse({ data: [candidate] }, platform, category)[0];
  }
}

function normalizeComments(raw: unknown): ResearchComment[] {
  return findObjectArray(raw)
    .map((item, index) => ({
      id: firstString(item, ["id", "cid", "comment_id", "commentId"]) || `comment-${index + 1}`,
      author: firstString(item, ["nickname", "user_name", "author", "name"]) || firstString(asRecord(item.user), ["nickname", "name"]) || "",
      text: firstString(item, ["text", "content", "comment", "desc"]) || "",
      likes: firstNumber(item, ["likes", "like_count", "digg_count", "likedCount"]),
      replies: firstNumber(item, ["reply_count", "sub_comment_count", "subCommentCount"]),
      publishedAt: readDate(item)
    }))
    .filter((comment) => comment.text);
}

function buildMaterialCandidates(platform: ResearchPlatform, searchItems: TrendItem[], detail?: TrendItem): ResearchMaterialCandidate[] {
  const candidates = [
    ...searchItems.map((item) => ({ item, source: "search" as const })),
    ...(detail ? [{ item: detail, source: "detail" as const }] : [])
  ];
  return candidates.map(({ item, source }) => ({
    title: item.title,
    url: item.url,
    platform,
    reason: source === "detail" ? "Parsed reference video detail; use for structure analysis, not direct copying." : "Keyword search hit; inspect hook, pacing, title angle, and comments before choosing as reference.",
    source
  }));
}

function buildNextActions(input: { searchItems: TrendItem[]; detail?: TrendItem; comments: ResearchComment[]; includeComments: boolean; skippedCommentsForMissingTikHubKey?: boolean }) {
  const actions: string[] = [];
  if (input.searchItems.length) {
    actions.push("Pick 3-5 search hits as references, then import only content you have rights to use.");
  }
  if (input.detail) {
    actions.push("Run material import/analyze on authorized files or your own recreation; use this detail as structural reference only.");
  }
  if (input.includeComments && input.comments.length) {
    actions.push("Extract objections and repeated phrases from comments into the script hook and pinned-comment plan.");
  }
  if (input.skippedCommentsForMissingTikHubKey) {
    actions.push("Comments were skipped because TikHub key is missing; KS-Downloader currently supplies free Kuaishou detail only.");
  }
  if (input.includeComments && !input.comments.length) {
    actions.push("No comment sample returned; retry with a platform item id if the URL parser did not expose one.");
  }
  return actions;
}

function timeoutMs(env: Record<string, string | undefined>) {
  const parsed = Number(env.TIKHUB_TIMEOUT_MS ?? DEFAULT_TIMEOUT_MS);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_TIMEOUT_MS;
}

function clampLimit(value: number | undefined) {
  const parsed = Number(value ?? DEFAULT_LIMIT);
  return Number.isFinite(parsed) ? Math.min(Math.max(Math.trunc(parsed), 1), 20) : DEFAULT_LIMIT;
}

function findObjectArray(raw: unknown): Record<string, unknown>[] {
  if (Array.isArray(raw)) {
    return raw.filter(isRecord);
  }
  const root = asRecord(raw);
  const paths = [
    ["data", "comments"],
    ["data", "comment_list"],
    ["data", "list"],
    ["data", "items"],
    ["data", "data", "comments"],
    ["data", "data", "list"],
    ["comments"],
    ["list"],
    ["items"]
  ];
  for (const path of paths) {
    const value = getPath(root, path);
    if (Array.isArray(value)) {
      return value.filter(isRecord);
    }
  }
  const nested = firstObjectArray(root);
  return nested ?? [];
}

function firstObject(value: unknown, seen = new Set<unknown>()): Record<string, unknown> | null {
  if (!isRecord(value) || seen.has(value)) {
    return null;
  }
  seen.add(value);
  if (looksLikeVideo(value)) {
    return value;
  }
  for (const child of Object.values(value)) {
    if (isRecord(child)) {
      const nested = firstObject(child, seen);
      if (nested) {
        return nested;
      }
    }
    if (Array.isArray(child)) {
      const object = child.find(isRecord);
      if (object) {
        return object;
      }
    }
  }
  return null;
}

function firstObjectArray(value: unknown, seen = new Set<unknown>()): Record<string, unknown>[] | null {
  if (!isRecord(value) || seen.has(value)) {
    return null;
  }
  seen.add(value);
  for (const child of Object.values(value)) {
    if (Array.isArray(child) && child.some(isRecord)) {
      return child.filter(isRecord);
    }
    const nested = firstObjectArray(child, seen);
    if (nested) {
      return nested;
    }
  }
  return null;
}

function looksLikeVideo(value: Record<string, unknown>) {
  return ["aweme_id", "photoId", "photo_id", "video_id", "desc", "title", "share_url"].some((key) => key in value);
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

function readDate(item: Record<string, unknown>) {
  const raw = item.create_time ?? item.createTime ?? item.timestamp ?? item.time_stamp;
  if (typeof raw === "number") {
    return new Date(raw > 10_000_000_000 ? raw : raw * 1000).toISOString();
  }
  if (typeof raw === "string" && raw) {
    const numeric = Number(raw);
    if (Number.isFinite(numeric)) {
      return new Date(numeric > 10_000_000_000 ? numeric : numeric * 1000).toISOString();
    }
    const parsed = new Date(raw);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toISOString();
    }
  }
  return new Date(0).toISOString();
}
