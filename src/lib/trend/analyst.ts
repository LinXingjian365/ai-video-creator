import type { ScoredItem, TopicCard } from "./types";
import type { LLMClient } from "@/lib/llm/client";

export interface Analysis {
  items: { id: string; viralLogic: string }[];
  patterns: string[];
  topicCards: TopicCard[];
}

const SYSTEM = [
  "你是短视频爆款分析师。基于给定视频的真实数据(播放/互动/涨速)解释其走红逻辑,提炼跨条共性套路,并给出可模仿的选题卡。",
  "严格只输出 JSON,不要任何额外文字。不要编造数据,只基于提供的指标做解释。",
  '输出格式: {"items":[{"id":"<视频id>","viralLogic":"<为什么火,1-2句>"}],"patterns":["<共性套路>"],"topicCards":[{"angle":"<选题角度>","hook":"<开场钩子>","structure":"<结构建议>","refItemIds":["<参考视频id>"]}]}',
].join("\n");

function buildPrompt(items: ScoredItem[]): string {
  const lines = items.map((it) =>
    `- id=${it.id} 标题《${it.title}》 作者:${it.author} 分区:${it.category} ` +
    `播放:${it.metrics.views} 点赞:${it.metrics.likes} 投币:${it.metrics.coins ?? 0} ` +
    `收藏:${it.metrics.favorites} 互动率:${it.signals.engagementRate.toFixed(3)} ` +
    `涨速:${Math.round(it.signals.velocity)}/h 潜力分:${it.potentialScore}`
  );
  return `以下是某分区排行榜的真实数据,请分析:\n${lines.join("\n")}`;
}

export function parseAnalysis(raw: string): Analysis {
  let text = raw.trim();
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) text = fence[1].trim();
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("LLM 响应中找不到 JSON");
  const parsed = JSON.parse(text.slice(start, end + 1)) as Partial<Analysis>;
  return {
    items: Array.isArray(parsed.items) ? parsed.items : [],
    patterns: Array.isArray(parsed.patterns) ? parsed.patterns : [],
    topicCards: Array.isArray(parsed.topicCards) ? parsed.topicCards : [],
  };
}

export async function analyzeTrends(items: ScoredItem[], client: LLMClient): Promise<Analysis> {
  const raw = await client.complete({ system: SYSTEM, prompt: buildPrompt(items) });
  return parseAnalysis(raw);
}
