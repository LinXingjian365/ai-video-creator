import type { IntelligenceReport, Platform, ScoredItem, TrendSource } from "./types";
import { scoreItems } from "./scorer";
import { analyzeTrends, type Analysis } from "./analyst";
import type { LLMClient } from "@/lib/llm/client";

const ANALYZE_TOP_K = 15;

export function assembleReport(
  platform: Platform,
  category: string,
  scored: ScoredItem[],
  analysis: Analysis | null,
  nowMs: number
): IntelligenceReport {
  const logicById = new Map((analysis?.items ?? []).map((i) => [i.id, i.viralLogic]));
  return {
    platform,
    category,
    generatedAt: new Date(nowMs).toISOString(),
    itemCount: scored.length,
    items: scored.map((s) => ({ ...s, viralLogic: logicById.get(s.id) ?? "" })),
    patterns: analysis?.patterns ?? [],
    topicCards: analysis?.topicCards ?? [],
    aiStatus: analysis ? "ok" : "failed",
  };
}

export async function buildReport(opts: {
  platform: Platform;
  category: string;
  source: TrendSource;
  client: LLMClient | null;
  topN: number;
  nowMs: number;
  onLog?: (msg: string) => void;
}): Promise<IntelligenceReport> {
  const { platform, category, source, client, topN, nowMs, onLog } = opts;
  onLog?.(`抓取 ${platform} ${category} 排行榜 top${topN}`);
  const items = await source.fetchTrends({ category, topN });
  onLog?.(`抓到 ${items.length} 条,开始打分`);
  const scored = scoreItems(items, nowMs);

  if (!client) {
    onLog?.("未配置 LLM,降级为仅榜单");
    return assembleReport(platform, category, scored, null, nowMs);
  }
  try {
    onLog?.("调用 LLM 分析爆火逻辑");
    const analysis = await analyzeTrends(scored.slice(0, ANALYZE_TOP_K), client);
    return assembleReport(platform, category, scored, analysis, nowMs);
  } catch (error) {
    onLog?.(`AI 分析失败,降级为仅榜单: ${error instanceof Error ? error.message : String(error)}`);
    return assembleReport(platform, category, scored, null, nowMs);
  }
}
