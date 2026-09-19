import fs from "node:fs";
import { getPublishAdapterStatus, listPublishAdapterStatus } from "@/lib/publish/adapters";
import { publishSpecs, type PublishPlatform } from "@/lib/publish/dry-run";
import { postizPublicBaseUrl } from "@/lib/publish/dispatch";

export interface PublishPreflightInput {
  probePostiz?: boolean;
  platforms?: PublishPlatform[];
}

export interface PostizIntegrationSummary {
  id: string;
  name?: string;
  identifier?: string;
  profile?: string;
  disabled?: boolean;
}

export interface PublishPreflightReport {
  checkedAt: string;
  liveEnabled: boolean;
  adapters: ReturnType<typeof listPublishAdapterStatus>;
  postiz: {
    /** Postiz 仅用于海外平台(TikTok/YouTube/X 等),不是国内平台(抖音/快手/B站)的发布途径。 */
    configured: boolean;
    baseUrl: string;
    endpoint: string;
    hasApiKey: boolean;
    probeStatus: "skipped" | "ok" | "failed";
    integrations: PostizIntegrationSummary[];
    error?: string;
  };
  socialAutoUpload: {
    configured: boolean;
    command: string;
    sessionDir?: string;
    sessionDirExists?: boolean;
    configPath?: string;
    configPathExists?: boolean;
  };
  blockers: string[];
  nextActions: string[];
}

export async function runPublishPreflight(
  input: PublishPreflightInput = {},
  deps: {
    env?: Record<string, string | undefined>;
    fetch?: typeof fetch;
    now?: () => Date;
  } = {}
): Promise<PublishPreflightReport> {
  const env = deps.env ?? process.env;
  const platforms = input.platforms?.length ? input.platforms : (Object.keys(publishSpecs) as PublishPlatform[]);
  const adapters = platforms.map((platform) => getPublishAdapterStatus(platform, env));
  const liveEnabled = env.PUBLISH_LIVE_ENABLED === "true";
  const postizBase = postizPublicBaseUrl(env);
  const postizEndpoint = `${postizBase}/integrations`;
  const hasPostizApiKey = Boolean(env.POSTIZ_API_KEY);

  // 国内平台(抖音/快手/B站)不通过 Postiz 发布,所以 integration id 缺失不再是 blocker。
  // Postiz 探测仅作为「海外平台可选网关」的参考,显式 probePostiz 时才发起。
  let probeStatus: PublishPreflightReport["postiz"]["probeStatus"] = "skipped";
  let integrations: PostizIntegrationSummary[] = [];
  let postizError: string | undefined;
  if (input.probePostiz && hasPostizApiKey) {
    try {
      const response = await (deps.fetch ?? fetch)(postizEndpoint, {
        headers: { Authorization: env.POSTIZ_API_KEY ?? "" }
      });
      const text = await response.text();
      if (!response.ok) {
        throw new Error(`Postiz integrations probe failed ${response.status}: ${text}`);
      }
      const parsed = text ? JSON.parse(text) : [];
      integrations = Array.isArray(parsed) ? parsed.map(normalizeIntegration) : [];
      probeStatus = "ok";
    } catch (error) {
      probeStatus = "failed";
      postizError = error instanceof Error ? error.message : String(error);
    }
  }

  const socialSessionDir = env.SOCIAL_AUTO_UPLOAD_SESSION_DIR;
  const socialConfig = env.SOCIAL_AUTO_UPLOAD_CONFIG;
  const socialAutoUpload = {
    configured: Boolean(socialSessionDir || socialConfig),
    command: env.SOCIAL_AUTO_UPLOAD_COMMAND || "social-auto-upload",
    sessionDir: socialSessionDir,
    sessionDirExists: socialSessionDir ? fs.existsSync(socialSessionDir) : undefined,
    configPath: socialConfig,
    configPathExists: socialConfig ? fs.existsSync(socialConfig) : undefined
  };

  const blockers = [
    ...(socialSessionDir && socialAutoUpload.sessionDirExists === false ? [`SOCIAL_AUTO_UPLOAD_SESSION_DIR not found: ${socialSessionDir}`] : []),
    ...(socialConfig && socialAutoUpload.configPathExists === false ? [`SOCIAL_AUTO_UPLOAD_CONFIG not found: ${socialConfig}`] : []),
    ...(probeStatus === "failed" && postizError ? [postizError] : [])
  ];

  const nextActions = buildNextActions({ liveEnabled, socialAutoUpload, probeStatus });

  return {
    checkedAt: (deps.now?.() ?? new Date()).toISOString(),
    liveEnabled,
    adapters,
    postiz: {
      configured: Boolean(env.POSTIZ_URL && hasPostizApiKey),
      baseUrl: postizBase,
      endpoint: postizEndpoint,
      hasApiKey: hasPostizApiKey,
      probeStatus,
      integrations,
      error: postizError
    },
    socialAutoUpload,
    blockers,
    nextActions
  };
}

function normalizeIntegration(value: Record<string, unknown>): PostizIntegrationSummary {
  return {
    id: String(value.id ?? ""),
    name: typeof value.name === "string" ? value.name : undefined,
    identifier: typeof value.identifier === "string" ? value.identifier : undefined,
    profile: typeof value.profile === "string" ? value.profile : undefined,
    disabled: typeof value.disabled === "boolean" ? value.disabled : undefined
  };
}

function buildNextActions(input: {
  liveEnabled: boolean;
  socialAutoUpload: PublishPreflightReport["socialAutoUpload"];
  probeStatus: PublishPreflightReport["postiz"]["probeStatus"];
}) {
  const actions: string[] = [];
  actions.push("国内平台(抖音/快手/B站)默认手动发布:成片、标题、简介、标签、封面已按平台规格生成,人工到平台后台上传。");
  if (!input.socialAutoUpload.configured) {
    actions.push("如需命令行发布,配置 SOCIAL_AUTO_UPLOAD_SESSION_DIR 或 SOCIAL_AUTO_UPLOAD_CONFIG(国内平台浏览器自动化)。");
  }
  if (input.probeStatus === "ok") {
    actions.push("Postiz 已连接海外平台渠道,如需发 TikTok/YouTube/X 可继续配置海外平台。");
  }
  if (input.probeStatus === "skipped") {
    actions.push("海外平台(TikTok/YouTube/X)可选走 Postiz:配置 POSTIZ_URL+POSTIZ_API_KEY 后重跑体检。");
  }
  if (!input.liveEnabled) {
    actions.push("保持 PUBLISH_LIVE_ENABLED=false,直到人工审阅通过。");
  }
  return actions;
}
