// 全链路自检:一次性探测各服务/依赖是否可用,供 UI「自检面板」和 /api/health/self-check 使用。
//
// 设计:
// - 在线服务(TTD/n8n/Postiz/KSD)走真实 HTTP 探活;任何 HTTP 响应(含 3xx/4xx)都算"可达"。
// - 本地能力(LLM/BGM/FFmpeg/yt-dlp)走配置判断 / 文件系统 / 二进制 --version。
// - 四态:ok(可用)/ down(已接线但探活失败)/ unconfigured(未配置且不可达)/ degraded(在线但未接线 或 缺关键凭证)。
// - 依赖注入(env/fetch/now/bgmCount/binaryProbes)便于单测,不在测试里真起子进程或打网络。

import { spawnSync } from "node:child_process";
import ffmpegInstaller from "@ffmpeg-installer/ffmpeg";
import { isTtdConfigured } from "@/lib/trend/sources/tiktok-downloader";
import { isKsdConfigured } from "@/lib/trend/sources/ks-downloader";
import { postizPublicBaseUrl } from "@/lib/publish/dispatch";
import { tryCreateLLMClient } from "@/lib/llm/client";
import { scanBgmLibrary } from "@/lib/bgm/library";
import { getYtDlpInvocation } from "@/lib/materials/yt-dlp";

export type SelfCheckStatus = "ok" | "down" | "unconfigured" | "degraded";
export type SelfCheckCategory = "service" | "capability";

export interface SelfCheckItem {
  id: string;
  label: string;
  category: SelfCheckCategory;
  status: SelfCheckStatus;
  detail: string;
  hint?: string;
}

export interface SelfCheckReport {
  checkedAt: string;
  summary: { ok: number; down: number; degraded: number; unconfigured: number; total: number };
  items: SelfCheckItem[];
}

export interface SelfCheckDeps {
  env?: Record<string, string | undefined>;
  fetch?: typeof fetch;
  now?: () => Date;
  // 返回本地 BGM 库曲目数;默认扫 workspace/input/audio
  bgmCount?: () => Promise<number>;
  // ffmpeg/yt-dlp 等二进制探测;默认 spawnSync --version。测试可注入 () => []
  binaryProbes?: () => SelfCheckItem[];
}

const DEFAULT_TIMEOUT_MS = 4000;

// 任何 HTTP 响应(哪怕 4xx/3xx)都说明服务在监听;只有网络层失败才算不可达。
async function isReachable(
  fetchImpl: typeof fetch,
  url: string,
  init?: RequestInit
): Promise<{ reachable: boolean; status: number }> {
  try {
    const res = await fetchImpl(url, {
      method: "GET",
      redirect: "manual",
      signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
      ...init
    });
    return { reachable: true, status: res.status };
  } catch {
    return { reachable: false, status: 0 };
  }
}

// 在线服务的四态判定:是否接线(configured) × 是否可达(reachable)
function serviceStatus(configured: boolean, reachable: boolean): SelfCheckStatus {
  if (reachable && configured) return "ok";
  if (reachable && !configured) return "degraded";
  if (!reachable && configured) return "down";
  return "unconfigured";
}

function originOf(url: string, fallback: string): string {
  try {
    return new URL(url).origin;
  } catch {
    return fallback;
  }
}

async function checkTtd(env: Record<string, string | undefined>, fetchImpl: typeof fetch): Promise<SelfCheckItem> {
  const base = (env.TTD_BASE_URL || "http://127.0.0.1:5555").replace(/\/+$/, "");
  const configured = isTtdConfigured(env);
  const { reachable } = await isReachable(fetchImpl, `${base}/docs`);
  const status = serviceStatus(configured, reachable);
  return {
    id: "ttd",
    label: "TikTokDownloader(免费抖音热榜)",
    category: "service",
    status,
    detail:
      status === "ok"
        ? `已接线且可达 ${base}`
        : status === "degraded"
          ? `${base} 在线,但 TTD_ENABLED 未开/未接线`
          : status === "down"
            ? `已接线但 ${base} 探活失败`
            : `未配置且 ${base} 不可达`,
    hint:
      status === "ok"
        ? undefined
        : status === "down" || status === "unconfigured"
          ? "启动:cd ~/Desktop/TikTokDownloader && .venv/Scripts/python.exe run_api.py"
          : "在 .env.local 设 TTD_ENABLED=true"
  };
}

async function checkN8n(env: Record<string, string | undefined>, fetchImpl: typeof fetch): Promise<SelfCheckItem> {
  const webhook = env.N8N_WEBHOOK_URL?.trim();
  const configured = Boolean(webhook);
  const base = webhook ? originOf(webhook, "http://localhost:5678") : "http://localhost:5678";
  const { reachable } = await isReachable(fetchImpl, `${base}/healthz`);
  const status = serviceStatus(configured, reachable);
  return {
    id: "n8n",
    label: "n8n(全链路编排)",
    category: "service",
    status,
    detail:
      status === "ok"
        ? `已接线且可达 ${base}`
        : status === "degraded"
          ? `${base} 在线,但 N8N_WEBHOOK_URL 未配置`
          : status === "down"
            ? `已接线但 ${base}/healthz 探活失败`
            : `未配置且 ${base} 不可达`,
    hint:
      status === "ok"
        ? undefined
        : status === "down" || status === "unconfigured"
          ? "启动:docker compose -f deployments/n8n/docker-compose.yml up -d"
          : "在 .env.local 设 N8N_WEBHOOK_URL"
  };
}

async function checkPostiz(env: Record<string, string | undefined>, fetchImpl: typeof fetch): Promise<SelfCheckItem> {
  const publicBase = postizPublicBaseUrl(env);
  const origin = originOf(publicBase, "http://localhost:5000");
  const apiKey = env.POSTIZ_API_KEY;
  const wired = Boolean(env.POSTIZ_URL || env.POSTIZ_API_URL);

  if (apiKey) {
    const { reachable, status: httpStatus } = await isReachable(fetchImpl, `${publicBase}/integrations`, {
      headers: { Authorization: apiKey }
    });
    const status: SelfCheckStatus = !reachable ? "down" : httpStatus === 200 ? "ok" : "degraded";
    return {
      id: "postiz",
      label: "Postiz(发布)",
      category: "service",
      status,
      detail:
        status === "ok"
          ? `已接线且 API key 有效 ${origin}`
          : status === "degraded"
            ? `${origin} 在线,但 /integrations 返回 ${httpStatus}(API key 可能失效)`
            : `已配 API key 但 ${origin} 探活失败`,
      hint:
        status === "ok"
          ? undefined
          : status === "down"
            ? "启动:docker compose -f deployments/postiz/docker-compose.yml up -d"
            : "在 Postiz UI 重新生成 API key 并更新 .env.local"
    };
  }

  const { reachable } = await isReachable(fetchImpl, `${origin}/`);
  const status = reachable ? "degraded" : wired ? "down" : "unconfigured";
  return {
    id: "postiz",
    label: "Postiz(发布)",
    category: "service",
    status,
    detail: reachable
      ? `${origin} 在线,但缺 POSTIZ_API_KEY`
      : wired
        ? `已配 POSTIZ_URL 但 ${origin} 探活失败`
        : `未配置且 ${origin} 不可达`,
    hint: reachable
      ? "登录 Postiz → 生成 API key 填入 .env.local 的 POSTIZ_API_KEY"
      : "启动:docker compose -f deployments/postiz/docker-compose.yml up -d"
  };
}

async function checkKsd(env: Record<string, string | undefined>, fetchImpl: typeof fetch): Promise<SelfCheckItem> {
  const base = (env.KSD_BASE_URL || "http://127.0.0.1:5557").replace(/\/+$/, "");
  const configured = isKsdConfigured(env);
  const { reachable } = await isReachable(fetchImpl, `${base}/`);
  const status = serviceStatus(configured, reachable);
  return {
    id: "ksd",
    label: "KS-Downloader(快手详情)",
    category: "service",
    status,
    detail:
      status === "ok"
        ? `已接线且可达 ${base}`
        : status === "degraded"
          ? `${base} 在线,但 KSD_ENABLED 未开`
          : status === "down"
            ? `已接线但 ${base} 探活失败`
            : `未配置(快手详情将退化到 TikHub 付费接口)`,
    hint:
      status === "unconfigured"
        ? "可选:启动 KS-Downloader 并设 KSD_ENABLED=true(不配则走 TikHub)"
        : status === "ok"
          ? undefined
          : "启动 KS-Downloader API server(默认 5557)"
  };
}

function checkLlm(env: Record<string, string | undefined>): SelfCheckItem {
  const provider = env.LLM_PROVIDER || "deepseek";
  const configured = Boolean(tryCreateLLMClient(env as never));
  return {
    id: "llm",
    label: `LLM(${provider})`,
    category: "capability",
    status: configured ? "ok" : "unconfigured",
    detail: configured ? `已配置 provider=${provider}(未实时 ping,避免计费)` : `缺 ${provider} API key`,
    hint: configured ? undefined : "在 .env.local 配置对应 provider 的 API key"
  };
}

async function checkBgm(bgmCount: () => Promise<number>): Promise<SelfCheckItem> {
  let count = 0;
  let errored = false;
  try {
    count = await bgmCount();
  } catch {
    errored = true;
  }
  const status: SelfCheckStatus = errored ? "down" : count > 0 ? "ok" : "unconfigured";
  return {
    id: "bgm",
    label: "BGM 本地库",
    category: "capability",
    status,
    detail: errored ? "扫描 workspace/input/audio 失败" : count > 0 ? `已收录 ${count} 首` : "库为空",
    hint: count > 0 || errored ? undefined : "把 CC0/CC-BY mp3 按 mood 放进 workspace/input/audio/<mood>/"
  };
}

// ffmpeg(内置 @ffmpeg-installer)+ yt-dlp 的 --version 探测
export function probeBinaries(): SelfCheckItem[] {
  const items: SelfCheckItem[] = [];

  const ffmpegPath = ffmpegInstaller?.path;
  const ffmpegRes = ffmpegPath
    ? spawnSync(ffmpegPath, ["-version"], { timeout: 6000, windowsHide: true, encoding: "utf8" })
    : null;
  const ffmpegOk = Boolean(ffmpegRes && ffmpegRes.status === 0);
  items.push({
    id: "ffmpeg",
    label: "FFmpeg(内置)",
    category: "capability",
    status: ffmpegOk ? "ok" : "down",
    detail: ffmpegOk
      ? (ffmpegRes!.stdout.split("\n")[0] || "可用").trim()
      : "内置 ffmpeg 二进制不可用",
    hint: ffmpegOk ? undefined : "检查 @ffmpeg-installer/ffmpeg 是否安装"
  });

  const yt = getYtDlpInvocation();
  const ytRes = spawnSync(yt.command, [...yt.prefixArgs, "--version"], {
    timeout: 6000,
    windowsHide: true,
    encoding: "utf8"
  });
  const ytOk = Boolean(ytRes && ytRes.status === 0);
  items.push({
    id: "yt-dlp",
    label: `yt-dlp(${yt.label})`,
    category: "capability",
    status: ytOk ? "ok" : "down",
    detail: ytOk ? `版本 ${(ytRes.stdout || "").trim()}` : "yt-dlp 不可用",
    hint: ytOk ? undefined : "pip install yt-dlp 或设置 YTDLP_BINARY"
  });

  return items;
}

export async function runSelfCheck(deps: SelfCheckDeps = {}): Promise<SelfCheckReport> {
  const env = deps.env ?? process.env;
  const fetchImpl = deps.fetch ?? fetch;
  const now = deps.now ?? (() => new Date());
  const bgmCount = deps.bgmCount ?? (async () => (await scanBgmLibrary()).length);
  const binaryProbes = deps.binaryProbes ?? probeBinaries;

  const [ttd, n8n, postiz, ksd, bgm] = await Promise.all([
    checkTtd(env, fetchImpl),
    checkN8n(env, fetchImpl),
    checkPostiz(env, fetchImpl),
    checkKsd(env, fetchImpl),
    checkBgm(bgmCount)
  ]);

  const items: SelfCheckItem[] = [ttd, n8n, postiz, ksd, checkLlm(env), bgm, ...binaryProbes()];

  const summary = { ok: 0, down: 0, degraded: 0, unconfigured: 0, total: items.length };
  for (const item of items) {
    summary[item.status] += 1;
  }

  return { checkedAt: now().toISOString(), summary, items };
}
