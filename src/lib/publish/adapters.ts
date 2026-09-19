import { publishSpecs, type PublishPlatform } from "@/lib/publish/dry-run";

export type PublishAdapterId = "social-auto-upload" | "postiz" | "manual";

export interface PublishAdapterStatus {
  platform: PublishPlatform;
  platformLabel: string;
  adapter: PublishAdapterId;
  configured: boolean;
  canPublish: boolean;
  dryRunOnly: boolean;
  manualConfirmRequired: boolean;
  requiredEnv: string[];
  hints: string[];
}

/**
 * 国内平台(抖音/快手/B站)的发布 adapter 决策。
 *
 * 关键事实:Postiz 只支持海外平台(TikTok/YouTube/X 等),**不支持抖音/快手/B站**。
 * 所以这些国内平台不能映射到 postiz——那样会在 UI 里给出一个永远连不上的假选项。
 *
 * 决策顺序:
 *   1. 配置了 social-auto-upload 登录态 → 走 social-auto-upload(命令行发布)
 *   2. 否则 → manual(项目产出合规成片 + 文案,人工去平台后台发布)
 *
 * 国内平台的自动发布 API 普遍要求企业资质,个人开发者通常拿不到,手动发布是现实且诚实的默认。
 */
export function getPublishAdapterStatus(
  platform: PublishPlatform,
  env: Record<string, string | undefined> = process.env
): PublishAdapterStatus {
  const spec = publishSpecs[platform];
  const socialSession = Boolean(env.SOCIAL_AUTO_UPLOAD_SESSION_DIR || env.SOCIAL_AUTO_UPLOAD_CONFIG);

  const configured = socialSession;
  const hints = configured
    ? ["已检测到 social-auto-upload 登录态,可尝试命令行发布(仍建议先 dry-run)。"]
    : [
        "当前走手动发布:成片、标题、简介、标签、封面已按平台规格生成,请到平台后台手动上传。",
        "国内平台的自动发布 API 普遍需要企业资质,个人账号通常无法自动发布。",
        "如需命令行发布,可配置 social-auto-upload 的登录态(SOCIAL_AUTO_UPLOAD_SESSION_DIR)。"
      ];

  return {
    platform,
    platformLabel: spec.label,
    adapter: socialSession ? "social-auto-upload" : "manual",
    configured,
    canPublish: false,
    dryRunOnly: true,
    manualConfirmRequired: true,
    requiredEnv: ["SOCIAL_AUTO_UPLOAD_SESSION_DIR or SOCIAL_AUTO_UPLOAD_CONFIG"],
    hints
  };
}

export function listPublishAdapterStatus(env: Record<string, string | undefined> = process.env): PublishAdapterStatus[] {
  return (Object.keys(publishSpecs) as PublishPlatform[]).map((platform) => getPublishAdapterStatus(platform, env));
}
