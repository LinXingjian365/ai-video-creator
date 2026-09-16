import type { LLMClient } from "@/lib/llm/client";
import { analyzeTrends, type Analysis } from "./analyst";
import { scoreItems } from "./scorer";
import type { IntelligenceReport, Platform, ScoredItem, TrendSource } from "./types";

const ANALYZE_TOP_K = 15;
const DEFAULT_ANALYSIS_TIMEOUT_MS = 45000;

function analysisTimeoutMs(): number {
  const parsed = Number(process.env.LLM_TIMEOUT_MS ?? DEFAULT_ANALYSIS_TIMEOUT_MS);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_ANALYSIS_TIMEOUT_MS;
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs);
  });

  return Promise.race([promise, timeout]).finally(() => {
    if (timer) {
      clearTimeout(timer);
    }
  });
}

export function assembleReport(
  platform: Platform,
  category: string,
  scored: ScoredItem[],
  analysis: Analysis | null,
  nowMs: number
): IntelligenceReport {
  const logicById = new Map((analysis?.items ?? []).map((item) => [item.id, item.viralLogic]));

  return {
    platform,
    category,
    generatedAt: new Date(nowMs).toISOString(),
    itemCount: scored.length,
    items: scored.map((item) => ({ ...item, viralLogic: logicById.get(item.id) ?? "" })),
    patterns: analysis?.patterns ?? [],
    topicCards: analysis?.topicCards ?? [],
    aiStatus: analysis ? "ok" : "failed"
  };
}

export async function buildReport(opts: {
  platform: Platform;
  category: string;
  source: TrendSource;
  client: LLMClient | null;
  topN: number;
  nowMs: number;
  llmTimeoutMs?: number;
  onLog?: (message: string) => void;
}): Promise<IntelligenceReport> {
  const { platform, category, source, client, topN, nowMs, onLog } = opts;

  onLog?.(`Fetching ${platform} ranking for ${category}, top ${topN}.`);
  const items = await source.fetchTrends({ category, topN });
  onLog?.(`Fetched ${items.length} items. Scoring by real metrics.`);

  const scored = scoreItems(items, nowMs);

  if (!client) {
    onLog?.("LLM is not configured. Returning real ranking with AI analysis marked as failed.");
    return assembleReport(platform, category, scored, null, nowMs);
  }

  try {
    onLog?.("Calling LLM to explain viral logic.");
    const timeoutMs = opts.llmTimeoutMs ?? analysisTimeoutMs();
    const analysis = await withTimeout(
      analyzeTrends(scored.slice(0, ANALYZE_TOP_K), client),
      timeoutMs,
      "LLM trend analysis"
    );
    return assembleReport(platform, category, scored, analysis, nowMs);
  } catch (error) {
    onLog?.(`AI analysis failed; falling back to ranking-only report: ${error instanceof Error ? error.message : String(error)}`);
    return assembleReport(platform, category, scored, null, nowMs);
  }
}
