import { getPublishAdapterStatus, type PublishAdapterId } from "@/lib/publish/adapters";
import {
  PUBLISH_CONFIRM_TEXT,
  readPublishQueue,
  writePublishQueue,
  type PublishQueueItem,
  type PublishQueueState
} from "@/lib/publish/queue";

export type PublishDispatchMode = "draft" | "live";
export type PublishDispatchStatus = "preview" | "drafted" | "sent" | "blocked";

export interface PublishDispatchInput {
  id: string;
  mode?: PublishDispatchMode;
  manualConfirm: string;
}

export interface PublishDispatchResult {
  id: string;
  platform: string;
  adapter: PublishAdapterId;
  mode: PublishDispatchMode;
  status: PublishDispatchStatus;
  liveEnabled: boolean;
  sent: boolean;
  endpoint?: string;
  requestPreview?: unknown;
  commandPreview?: string[];
  response?: unknown;
  message: string;
}

export interface PostizDraftPayload {
  type: "draft" | "schedule" | "now";
  date: string;
  shortLink: boolean;
  tags: string[];
  posts: Array<{
    integration: { id: string };
    value: Array<{ content: string; image: unknown[] }>;
    settings: { __type: string };
  }>;
}

export function postizPublicBaseUrl(env: Record<string, string | undefined> = process.env) {
  const raw = (env.POSTIZ_URL || env.POSTIZ_API_URL || "https://api.postiz.com").replace(/\/+$/, "");
  if (/\/public\/v1$/i.test(raw)) {
    return raw;
  }
  return `${raw}/public/v1`;
}

export function postizIntegrationEnvName(platform: string) {
  return `POSTIZ_INTEGRATION_ID_${platform.toUpperCase()}`;
}

export function postizPlatformTypeEnvName(platform: string) {
  return `POSTIZ_PLATFORM_TYPE_${platform.toUpperCase()}`;
}

export function buildPlatformContent(item: PublishQueueItem) {
  const tags = item.input.tags?.map((tag) => tag.startsWith("#") ? tag : `#${tag}`) ?? [];
  const lines = [
    item.input.title.trim(),
    item.input.description?.trim(),
    tags.length ? tags.join(" ") : ""
  ].filter(Boolean);
  return lines.join("\n\n");
}

export function buildPostizDraftPayload(
  item: PublishQueueItem,
  env: Record<string, string | undefined> = process.env
): PostizDraftPayload {
  const integrationId = env[postizIntegrationEnvName(item.input.platform)];
  if (!integrationId) {
    throw new Error(`缺少 ${postizIntegrationEnvName(item.input.platform)},无法创建 Postiz 草稿。`);
  }
  const platformType = env[postizPlatformTypeEnvName(item.input.platform)] ?? item.input.platform;
  return {
    type: "draft",
    date: new Date().toISOString(),
    shortLink: false,
    tags: [],
    posts: [
      {
        integration: { id: integrationId },
        value: [{ content: buildPlatformContent(item), image: [] }],
        settings: { __type: platformType }
      }
    ]
  };
}

export function buildSocialAutoUploadCommand(
  item: PublishQueueItem,
  env: Record<string, string | undefined> = process.env
) {
  const command = env.SOCIAL_AUTO_UPLOAD_COMMAND || "social-auto-upload";
  return [
    command,
    "--platform",
    item.input.platform,
    "--video",
    item.input.videoPath,
    "--title",
    item.input.title,
    "--dry-run"
  ];
}

export async function dispatchPublishQueueItem(
  input: PublishDispatchInput,
  deps: {
    env?: Record<string, string | undefined>;
    fetch?: typeof fetch;
    readPublishQueue?: typeof readPublishQueue;
    writePublishQueue?: typeof writePublishQueue;
  } = {}
): Promise<PublishDispatchResult> {
  if (input.manualConfirm !== PUBLISH_CONFIRM_TEXT) {
    throw new Error(`人工确认失败:请输入 ${PUBLISH_CONFIRM_TEXT}`);
  }

  const env = deps.env ?? process.env;
  const queue = await (deps.readPublishQueue ?? readPublishQueue)();
  const index = queue.items.findIndex((item) => item.id === input.id);
  if (index < 0) {
    throw new Error(`找不到发布队列项:${input.id}`);
  }

  const item = queue.items[index];
  if (item.status !== "approved") {
    throw new Error("只有 approved 队列项才能进入 dispatch。");
  }

  const mode = input.mode ?? "draft";
  const liveEnabled = env.PUBLISH_LIVE_ENABLED === "true";
  const adapter = getPublishAdapterStatus(item.input.platform, env).adapter;

  if (adapter === "postiz") {
    return dispatchPostizDraft(item, queue, index, mode, liveEnabled, env, deps.fetch, deps.writePublishQueue);
  }

  if (adapter === "social-auto-upload") {
    const commandPreview = buildSocialAutoUploadCommand(item, env);
    return {
      id: item.id,
      platform: item.input.platform,
      adapter,
      mode,
      status: "preview",
      liveEnabled,
      sent: false,
      commandPreview,
      message: "已生成 social-auto-upload 命令预览。当前不执行外部上传命令。"
    };
  }

  return {
    id: item.id,
    platform: item.input.platform,
    adapter,
    mode,
    status: "preview",
    liveEnabled,
    sent: false,
    message: "当前为 manual adapter:请手动发布并在数据回流中登记 postUrl/postId。"
  };
}

async function dispatchPostizDraft(
  item: PublishQueueItem,
  queue: PublishQueueState,
  index: number,
  mode: PublishDispatchMode,
  liveEnabled: boolean,
  env: Record<string, string | undefined>,
  fetchImpl: typeof fetch = fetch,
  writeQueue: typeof writePublishQueue = writePublishQueue
): Promise<PublishDispatchResult> {
  const payload = buildPostizDraftPayload(item, env);
  const endpoint = `${postizPublicBaseUrl(env)}/posts`;
  const apiKey = env.POSTIZ_API_KEY;

  if (!apiKey || !liveEnabled || mode !== "draft") {
    return {
      id: item.id,
      platform: item.input.platform,
      adapter: "postiz",
      mode,
      status: "preview",
      liveEnabled,
      sent: false,
      endpoint,
      requestPreview: payload,
      message: !apiKey
        ? "缺少 POSTIZ_API_KEY,仅生成 Postiz 草稿请求预览。"
        : "未开启 PUBLISH_LIVE_ENABLED=true 或 mode 不是 draft,仅生成 Postiz 草稿请求预览。"
    };
  }

  const response = await fetchImpl(endpoint, {
    method: "POST",
    headers: {
      Authorization: apiKey,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });
  const text = await response.text();
  let parsed: unknown = text;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = text;
  }
  if (!response.ok) {
    throw new Error(`Postiz draft request failed ${response.status}: ${text}`);
  }

  const now = new Date().toISOString();
  queue.items[index] = { ...item, status: "published", updatedAt: now };
  await writeQueue(queue);
  return {
    id: item.id,
    platform: item.input.platform,
    adapter: "postiz",
    mode,
    status: "drafted",
    liveEnabled,
    sent: true,
    endpoint,
    requestPreview: payload,
    response: parsed,
    message: "Postiz 草稿已创建。它仍需在 Postiz UI 中进一步审核/发布。"
  };
}
