import fs from "node:fs/promises";
import path from "node:path";
import { draftsRoot } from "@/lib/paths";
import type { PublishPlatform } from "@/lib/publish/dry-run";

export type AnalyticsWindow = "30m" | "24h" | "7d" | "custom";

export interface AnalyticsMetrics {
  views: number;
  likes: number;
  comments: number;
  shares: number;
  favorites?: number;
  followersDelta?: number;
  completionRate?: number;
  avgWatchSec?: number;
}

export interface AnalyticsSnapshot {
  id: string;
  platform: PublishPlatform;
  postId?: string;
  postUrl?: string;
  title?: string;
  capturedAt: string;
  window: AnalyticsWindow;
  metrics: AnalyticsMetrics;
  signals: {
    engagementRate: number;
    shareRate: number;
    commentRate: number;
    followerConversionRate: number;
  };
  nextActions: string[];
}

export interface AnalyticsLedger {
  schema: "ai-video-assistant.analytics-ledger.v1";
  updatedAt: string;
  snapshots: AnalyticsSnapshot[];
}

export interface AnalyticsImportInput {
  platform: PublishPlatform;
  postId?: string;
  postUrl?: string;
  title?: string;
  capturedAt?: string;
  window?: AnalyticsWindow;
  metrics: AnalyticsMetrics;
}

export const ANALYTICS_LEDGER_FILE = path.join(draftsRoot, "analytics-ledger.json");

export async function readAnalyticsLedger(filePath = ANALYTICS_LEDGER_FILE): Promise<AnalyticsLedger> {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    const parsed = JSON.parse(raw) as AnalyticsLedger;
    if (parsed.schema === "ai-video-assistant.analytics-ledger.v1" && Array.isArray(parsed.snapshots)) {
      return parsed;
    }
  } catch {
    // Missing or malformed ledger starts fresh.
  }
  return { schema: "ai-video-assistant.analytics-ledger.v1", updatedAt: new Date(0).toISOString(), snapshots: [] };
}

export async function writeAnalyticsLedger(ledger: AnalyticsLedger, filePath = ANALYTICS_LEDGER_FILE): Promise<AnalyticsLedger> {
  const next = { ...ledger, updatedAt: new Date().toISOString() };
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(next, null, 2)}\n`, "utf8");
  return next;
}

export function computeAnalyticsSignals(metrics: AnalyticsMetrics) {
  const views = Math.max(0, metrics.views);
  if (views === 0) {
    return { engagementRate: 0, shareRate: 0, commentRate: 0, followerConversionRate: 0 };
  }
  return {
    engagementRate: round4((metrics.likes + metrics.comments + metrics.shares + (metrics.favorites ?? 0)) / views),
    shareRate: round4(metrics.shares / views),
    commentRate: round4(metrics.comments / views),
    followerConversionRate: round4((metrics.followersDelta ?? 0) / views)
  };
}

export function recommendNextActions(snapshot: Pick<AnalyticsSnapshot, "window" | "metrics" | "signals">) {
  const actions: string[] = [];
  const { metrics, signals } = snapshot;
  if (metrics.views < 500 && snapshot.window === "30m") {
    actions.push("前30分钟曝光偏低:优先换标题/封面或换发布时间再测。");
  }
  if ((metrics.completionRate ?? 0) > 0.45 && signals.shareRate > 0.01) {
    actions.push("完播和分享都不错:保留结构,围绕同题材追更一条。");
  }
  if (signals.commentRate > 0.01) {
    actions.push("评论率较高:置顶评论引导二次互动,提炼争议点做续集。");
  }
  if (signals.engagementRate < 0.03 && metrics.views > 1000) {
    actions.push("有曝光但互动弱:重剪前3秒和价值承诺,减少铺垫。");
  }
  if ((metrics.followersDelta ?? 0) > 0) {
    actions.push("有涨粉信号:复用人设表达和结尾行动号召。");
  }
  if (actions.length === 0) {
    actions.push("数据不足或信号中性:继续补充24小时/7天快照再决策。");
  }
  return actions;
}

export async function importAnalyticsSnapshot(
  input: AnalyticsImportInput,
  deps: {
    readAnalyticsLedger?: typeof readAnalyticsLedger;
    writeAnalyticsLedger?: typeof writeAnalyticsLedger;
    now?: () => Date;
  } = {}
): Promise<AnalyticsSnapshot> {
  const capturedAt = input.capturedAt ?? (deps.now?.() ?? new Date()).toISOString();
  const signals = computeAnalyticsSignals(input.metrics);
  const snapshot: AnalyticsSnapshot = {
    id: `${input.platform}-${input.postId || slug(input.postUrl || input.title || "post")}-${Date.parse(capturedAt) || Date.now()}`,
    platform: input.platform,
    postId: input.postId,
    postUrl: input.postUrl,
    title: input.title,
    capturedAt,
    window: input.window ?? "custom",
    metrics: input.metrics,
    signals,
    nextActions: recommendNextActions({ window: input.window ?? "custom", metrics: input.metrics, signals })
  };
  const ledger = await (deps.readAnalyticsLedger ?? readAnalyticsLedger)();
  ledger.snapshots = [snapshot, ...ledger.snapshots].slice(0, 500);
  await (deps.writeAnalyticsLedger ?? writeAnalyticsLedger)(ledger);
  return snapshot;
}

function round4(value: number) {
  return Math.round(value * 10000) / 10000;
}

function slug(value: string) {
  return value.replace(/[^a-z0-9\u4e00-\u9fa5]+/gi, "-").replace(/^-+|-+$/g, "").slice(0, 64) || "post";
}
