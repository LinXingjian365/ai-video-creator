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
 * 国内平台的现实路径是 **social-auto-upload**(浏览器自动化,11K★ 开源):
 *   抖音/快手/B站/小红书/视频号 等都没有面向个人的开放上传 API,
 *   但浏览器自动化可以直接操作创作者后台,等价于"人工上传"的自动化。
 *
 * 决策顺序:
 *   1. 配置了 social-auto-upload → 走 social-auto-upload
 *   2. 否则 → manual(项目产出合规成片 + 文案,人工去平台后台发布)
 */
export function getPublishAdapterStatus(
  platform: PublishPlatform,
  env: Record<string, string | undefined> = process.env
): PublishAdapterStatus {
  const spec = publishSpecs[platform];
  const socialAutoUpload = Boolean(
    env.SOCIAL_AUTO_UPLOAD_DIR || env.SOCIAL_AUTO_UPLOAD_SESSION_DIR || env.SOCIAL_AUTO_UPLOAD_CONFIG
  );

  const hints = socialAutoUpload
    ? [
        "已检测到 social-auto-upload 配置。首次使用需先登录该平台账号(浏览器扫码),登录态保存在安装目录的 cookies/ 下。",
        "真正执行上传需同时开启 SOCIAL_AUTO_UPLOAD_EXECUTE=true 与 PUBLISH_LIVE_ENABLED=true 并使用 mode=live。"
      ]
    : [
        "当前走手动发布:成片、标题、简介、标签、封面已按平台规格生成,请到平台后台手动上传。",
        "国内平台的开放上传 API 普遍需要企业资质;自动化发布走 social-auto-upload(浏览器自动化)。",
        "配置 SOCIAL_AUTO_UPLOAD_DIR 指向 social-auto-upload 安装目录即可启用,见 docs/MANUAL_SETUP.md。"
      ];

  return {
    platform,
    platformLabel: spec.label,
    adapter: socialAutoUpload ? "social-auto-upload" : "manual",
    configured: socialAutoUpload,
    canPublish: false,
    dryRunOnly: true,
    manualConfirmRequired: true,
    requiredEnv: ["SOCIAL_AUTO_UPLOAD_DIR (+ SOCIAL_AUTO_UPLOAD_ACCOUNT_<PLATFORM>)"],
    hints
  };
}

export function listPublishAdapterStatus(env: Record<string, string | undefined> = process.env): PublishAdapterStatus[] {
  return (Object.keys(publishSpecs) as PublishPlatform[]).map((platform) => getPublishAdapterStatus(platform, env));
}
