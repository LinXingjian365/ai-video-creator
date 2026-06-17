export type Platform = "bilibili" | "douyin" | "youtube";

export interface TrendMetrics {
  views: number;
  likes: number;
  coins?: number;
  favorites: number;
  shares: number;
  comments: number;
  danmaku?: number;
}

export interface TrendItem {
  platform: Platform;
  id: string;
  title: string;
  author: string;
  authorId: string;
  category: string;
  tags: string[];
  url: string;
  thumbnail: string;
  publishedAt: string;
  durationSec: number;
  metrics: TrendMetrics;
}

export interface TrendSource {
  readonly platform: Platform;
  fetchTrends(opts: { category: string; topN: number }): Promise<TrendItem[]>;
}

export interface SignalSet {
  engagementRate: number;
  velocity: number;
  danmakuDensity?: number;
  commentRate: number;
}

export interface ScoredItem extends TrendItem {
  signals: SignalSet;
  potentialScore: number;
  confidence: number;
}

export interface TopicCard {
  angle: string;
  hook: string;
  structure: string;
  refItemIds: string[];
}

export interface ReportItem extends ScoredItem {
  viralLogic: string;
}

export interface IntelligenceReport {
  platform: Platform;
  category: string;
  generatedAt: string;
  itemCount: number;
  items: ReportItem[];
  patterns: string[];
  topicCards: TopicCard[];
  aiStatus: "ok" | "failed";
}
