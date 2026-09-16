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

export function getPublishAdapterStatus(
  platform: PublishPlatform,
  env: Record<string, string | undefined> = process.env
): PublishAdapterStatus {
  const spec = publishSpecs[platform];
  const socialSession = Boolean(env.SOCIAL_AUTO_UPLOAD_SESSION_DIR || env.SOCIAL_AUTO_UPLOAD_CONFIG);
  const postiz = Boolean(env.POSTIZ_URL && env.POSTIZ_API_KEY);

  if (platform === "bilibili") {
    const configured = socialSession || Boolean(env.BILI_COOKIE) || postiz;
    return {
      platform,
      platformLabel: spec.label,
      adapter: socialSession ? "social-auto-upload" : postiz ? "postiz" : "manual",
      configured,
      canPublish: false,
      dryRunOnly: true,
      manualConfirmRequired: true,
      requiredEnv: ["SOCIAL_AUTO_UPLOAD_SESSION_DIR or BILI_COOKIE or POSTIZ_URL+POSTIZ_API_KEY"],
      hints: configured
        ? ["已检测到发布相关凭据或配置，但当前版本仍只允许 dry-run 和人工确认。"]
        : ["配置 social-auto-upload 登录态、BILI_COOKIE 或 Postiz 后，再接真实发布 adapter。"]
    };
  }

  const configured = socialSession || postiz;
  return {
    platform,
    platformLabel: spec.label,
    adapter: socialSession ? "social-auto-upload" : postiz ? "postiz" : "manual",
    configured,
    canPublish: false,
    dryRunOnly: true,
    manualConfirmRequired: true,
    requiredEnv: ["SOCIAL_AUTO_UPLOAD_SESSION_DIR or POSTIZ_URL+POSTIZ_API_KEY"],
    hints: configured
      ? ["已检测到发布相关凭据或配置，但当前版本仍只允许 dry-run 和人工确认。"]
      : ["配置 social-auto-upload 登录态或 Postiz 后，再接真实发布 adapter。"]
  };
}

export function listPublishAdapterStatus(env: Record<string, string | undefined> = process.env): PublishAdapterStatus[] {
  return (Object.keys(publishSpecs) as PublishPlatform[]).map((platform) => getPublishAdapterStatus(platform, env));
}
