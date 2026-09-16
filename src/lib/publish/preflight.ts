import fs from "node:fs";
import { getPublishAdapterStatus, listPublishAdapterStatus } from "@/lib/publish/adapters";
import { publishSpecs, type PublishPlatform } from "@/lib/publish/dry-run";
import { postizIntegrationEnvName, postizPublicBaseUrl } from "@/lib/publish/dispatch";

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
    configured: boolean;
    baseUrl: string;
    endpoint: string;
    hasApiKey: boolean;
    missingIntegrationEnv: string[];
    configuredIntegrationEnv: string[];
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
  const missingIntegrationEnv = platforms
    .map((platform) => postizIntegrationEnvName(platform))
    .filter((name) => !env[name]);
  const configuredIntegrationEnv = platforms
    .map((platform) => postizIntegrationEnvName(platform))
    .filter((name) => Boolean(env[name]));

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
    ...(!hasPostizApiKey ? ["POSTIZ_API_KEY is not configured."] : []),
    ...(missingIntegrationEnv.length ? [`Missing platform integration ids: ${missingIntegrationEnv.join(", ")}`] : []),
    ...(socialSessionDir && socialAutoUpload.sessionDirExists === false ? [`SOCIAL_AUTO_UPLOAD_SESSION_DIR not found: ${socialSessionDir}`] : []),
    ...(socialConfig && socialAutoUpload.configPathExists === false ? [`SOCIAL_AUTO_UPLOAD_CONFIG not found: ${socialConfig}`] : []),
    ...(probeStatus === "failed" && postizError ? [postizError] : [])
  ];

  const nextActions = buildNextActions({ liveEnabled, hasPostizApiKey, missingIntegrationEnv, socialAutoUpload, probeStatus });

  return {
    checkedAt: (deps.now?.() ?? new Date()).toISOString(),
    liveEnabled,
    adapters,
    postiz: {
      configured: Boolean(env.POSTIZ_URL && hasPostizApiKey),
      baseUrl: postizBase,
      endpoint: postizEndpoint,
      hasApiKey: hasPostizApiKey,
      missingIntegrationEnv,
      configuredIntegrationEnv,
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
  hasPostizApiKey: boolean;
  missingIntegrationEnv: string[];
  socialAutoUpload: PublishPreflightReport["socialAutoUpload"];
  probeStatus: PublishPreflightReport["postiz"]["probeStatus"];
}) {
  const actions: string[] = [];
  if (!input.hasPostizApiKey) {
    actions.push("Configure POSTIZ_API_KEY before probing connected channels.");
  }
  if (input.missingIntegrationEnv.length) {
    actions.push("Set POSTIZ_INTEGRATION_ID_DOUYIN/KUAISHOU/BILIBILI for every platform you want to draft.");
  }
  if (!input.socialAutoUpload.configured) {
    actions.push("Configure SOCIAL_AUTO_UPLOAD_SESSION_DIR or SOCIAL_AUTO_UPLOAD_CONFIG before domestic-platform browser automation.");
  }
  if (input.probeStatus === "ok") {
    actions.push("Create one approved queue item, then dispatch mode=draft with PUBLISH_LIVE_ENABLED=false first.");
  }
  if (!input.liveEnabled) {
    actions.push("Keep PUBLISH_LIVE_ENABLED=false until a Postiz draft smoke test is reviewed.");
  }
  return actions;
}
