import { postizIntegrationEnvName, postizPublicBaseUrl } from "@/lib/publish/dispatch";

type Env = Record<string, string | undefined>;

export type PostizPlatform = "douyin" | "kuaishou" | "bilibili";

export interface PostizIntegrationSummary {
  id: string;
  name: string;
  provider?: string;
  type?: string;
  platformHint: PostizPlatform | "unknown";
}

export interface PostizPlatformBinding {
  platform: PostizPlatform;
  envKey: string;
  configured: boolean;
  configuredId?: string;
  candidateIds: string[];
}

export interface PostizIntegrationsProbeResult {
  ok: boolean;
  configured: boolean;
  baseUrl: string;
  detail: string;
  integrations: PostizIntegrationSummary[];
  platforms: PostizPlatformBinding[];
}

const REQUIRED_PLATFORMS: PostizPlatform[] = ["douyin", "kuaishou", "bilibili"];

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function pickString(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return undefined;
}

function pickNestedString(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    const nested = asRecord(value);
    if (nested) {
      const nestedValue = pickString(nested, ["id", "name", "title", "type", "provider", "identifier"]);
      if (nestedValue) return nestedValue;
    }
  }
  return undefined;
}

function extractArray(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  const record = asRecord(value);
  if (!record) return [];
  for (const key of ["integrations", "items", "data", "results", "rows"]) {
    const nested = record[key];
    const extracted = extractArray(nested);
    if (extracted.length) return extracted;
  }
  return [];
}

export function inferPostizPlatformHint(input: string): PostizPlatform | "unknown" {
  const text = input.toLowerCase();
  if (/(bilibili|bili|b站|哔哩|哔哩哔哩)/i.test(text)) return "bilibili";
  if (/(kuaishou|kwai|快手)/i.test(text)) return "kuaishou";
  if (/(douyin|抖音|tiktok|tik tok)/i.test(text)) return "douyin";
  return "unknown";
}

export function normalizePostizIntegrations(payload: unknown): PostizIntegrationSummary[] {
  return extractArray(payload).flatMap((item) => {
    const record = asRecord(item);
    if (!record) return [];
    const id = pickString(record, ["id", "_id", "integrationId", "identifier"]);
    if (!id) return [];
    const name = pickString(record, ["name", "title", "label", "username"]) ?? id;
    const provider = pickNestedString(record, ["provider", "social", "service", "platform"]);
    const type = pickNestedString(record, ["type", "platformType", "identifier", "settings"]);
    const platformHint = inferPostizPlatformHint([id, name, provider, type].filter(Boolean).join(" "));
    return [{ id, name, provider, type, platformHint }];
  });
}

function buildPlatformBindings(env: Env, integrations: PostizIntegrationSummary[]): PostizPlatformBinding[] {
  return REQUIRED_PLATFORMS.map((platform) => {
    const envKey = postizIntegrationEnvName(platform);
    const configuredId = env[envKey]?.trim();
    return {
      platform,
      envKey,
      configured: Boolean(configuredId),
      ...(configuredId ? { configuredId } : {}),
      candidateIds: integrations
        .filter((integration) => integration.platformHint === platform)
        .map((integration) => integration.id)
    };
  });
}

export async function probePostizIntegrations(
  env: Env = process.env,
  deps: { fetch?: typeof fetch } = {}
): Promise<PostizIntegrationsProbeResult> {
  const baseUrl = postizPublicBaseUrl(env);
  const apiKey = env.POSTIZ_API_KEY?.trim();
  if (!apiKey) {
    return {
      ok: false,
      configured: false,
      baseUrl,
      detail: "缺少 POSTIZ_API_KEY。请先在本地 Postiz 生成 API Key。",
      integrations: [],
      platforms: buildPlatformBindings(env, [])
    };
  }

  try {
    const response = await (deps.fetch ?? fetch)(`${baseUrl}/integrations`, {
      headers: { Authorization: apiKey },
      signal: AbortSignal.timeout(8000)
    });
    if (!response.ok) {
      return {
        ok: false,
        configured: true,
        baseUrl,
        detail: `Postiz integrations 探测失败（HTTP ${response.status}）。请检查 API Key 或本地 Postiz 登录状态。`,
        integrations: [],
        platforms: buildPlatformBindings(env, [])
      };
    }
    const payload = await response.json().catch(() => []);
    const integrations = normalizePostizIntegrations(payload);
    return {
      ok: true,
      configured: true,
      baseUrl,
      detail: integrations.length
        ? `已读取 ${integrations.length} 个 Postiz integration。`
        : "Postiz API 可用，但当前没有返回已连接渠道。请先在 Postiz UI 完成平台 OAuth。",
      integrations,
      platforms: buildPlatformBindings(env, integrations)
    };
  } catch {
    return {
      ok: false,
      configured: true,
      baseUrl,
      detail: "Postiz integrations 探测失败。请确认本地 Postiz 正在运行。",
      integrations: [],
      platforms: buildPlatformBindings(env, [])
    };
  }
}
