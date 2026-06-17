import type { Platform, TrendSource } from "../types";
import { bilibiliSource } from "./bilibili";
import { douyinSource } from "./douyin";
import { youtubeSource } from "./youtube";

export const trendSources: Record<Platform, TrendSource> = {
  bilibili: bilibiliSource,
  douyin: douyinSource,
  youtube: youtubeSource
};

export function getTrendSource(platform: Platform): TrendSource {
  const source = trendSources[platform];
  if (!source) {
    throw new Error(`Unsupported trend platform: ${platform}`);
  }
  return source;
}
