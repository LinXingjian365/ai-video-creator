import type { TrendItem, ScoredItem, SignalSet } from "./types";

const HOUR_MS = 3_600_000;

export function computeSignals(item: TrendItem, nowMs: number): SignalSet {
  const m = item.metrics;
  const views = Math.max(m.views, 1);
  const interactions = m.likes + (m.coins ?? 0) + m.favorites + m.shares;
  const hours = Math.max((nowMs - Date.parse(item.publishedAt)) / HOUR_MS, 1);
  return {
    engagementRate: interactions / views,
    velocity: views / hours,
    danmakuDensity: m.danmaku !== undefined ? m.danmaku / views : undefined,
    commentRate: m.comments / views,
  };
}

// 置信度 = 数据支撑强度(完整度 + 新鲜度), 不是"会火的概率"
export function computeConfidence(item: TrendItem, nowMs: number): number {
  const m = item.metrics;
  const fields = [m.views, m.likes, m.favorites, m.shares, m.comments];
  const present = fields.filter((v) => typeof v === "number" && v > 0).length;
  const completeness = (present / fields.length) * 60;
  const hours = (nowMs - Date.parse(item.publishedAt)) / HOUR_MS;
  const freshness = hours >= 0 && hours <= 168 ? (1 - hours / 168) * 40 : 0;
  return Math.round(Math.min(completeness + freshness, 100));
}

function minMax(value: number, all: number[]): number {
  const mn = Math.min(...all);
  const mx = Math.max(...all);
  return mx === mn ? 0.5 : (value - mn) / (mx - mn);
}

export function scoreItems(items: TrendItem[], nowMs: number): ScoredItem[] {
  const withSignals = items.map((item) => ({ item, signals: computeSignals(item, nowMs) }));
  const engAll = withSignals.map((w) => w.signals.engagementRate);
  const velAll = withSignals.map((w) => w.signals.velocity);

  const scored = withSignals.map(({ item, signals }) => {
    const potentialScore = Math.round(
      (minMax(signals.engagementRate, engAll) * 0.6 + minMax(signals.velocity, velAll) * 0.4) * 100
    );
    return { ...item, signals, potentialScore, confidence: computeConfidence(item, nowMs) };
  });

  return scored.sort((a, b) => b.potentialScore - a.potentialScore);
}
