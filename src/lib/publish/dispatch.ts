import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
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

export interface PublishCommandRunResult {
  code: number | null;
  stdout: string;
  stderr: string;
}

export type RunPublishCommand = (
  command: string[],
  options: { cwd?: string; timeoutMs: number }
) => Promise<PublishCommandRunResult>;

/** 默认执行器:spawn 子进程,带超时与输出捕获。 */
const defaultRunPublishCommand: RunPublishCommand = (command, { cwd, timeoutMs }) =>
  new Promise((resolve) => {
    const [file, ...args] = command;
    const child = spawn(file, args, { cwd, windowsHide: true });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => child.kill(), timeoutMs);

    child.stdout?.on("data", (chunk: Buffer) => { stdout += chunk.toString(); });
    child.stderr?.on("data", (chunk: Buffer) => { stderr += chunk.toString(); });
    child.on("error", (error: Error) => {
      clearTimeout(timer);
      resolve({ code: null, stdout, stderr: `${stderr}${error.message}` });
    });
    child.on("close", (code: number | null) => {
      clearTimeout(timer);
      resolve({ code, stdout, stderr });
    });
  });

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

/**
 * 构造 social-auto-upload 的真实 CLI 命令。
 *
 * 上游 CLI 形态是 `sau <platform> <action> --account ... --file ...`(不是 flag 式),
 * 且**没有 --dry-run 参数**——"只预览不执行"由本项目的 adapter 层保证(默认不 spawn),
 * 不能靠 CLI 的开关。
 *
 * 各平台差异:
 *   - bilibili:`--desc` 和 `--tid`(分区 id)都是**必需**参数
 *   - 其余平台:`--desc` / `--tags` 可选
 *   - 账号名是用户在 `sau <platform> login --account <name>` 时自定义的,需按平台配置
 */
export function buildSocialAutoUploadCommand(
  item: PublishQueueItem,
  env: Record<string, string | undefined> = process.env
): string[] {
  const platform = item.input.platform;
  const dir = (env.SOCIAL_AUTO_UPLOAD_DIR ?? "").trim().replace(/[\\/]+$/, "");

  const python = (env.SOCIAL_AUTO_UPLOAD_PYTHON ?? "").trim()
    || (dir ? `${dir}\\.venv\\Scripts\\python.exe` : "python");
  const cli = (env.SOCIAL_AUTO_UPLOAD_CLI ?? "").trim()
    || (dir ? `${dir}\\sau_cli.py` : "sau_cli.py");
  const account = (env[`SOCIAL_AUTO_UPLOAD_ACCOUNT_${platform.toUpperCase()}`] ?? "").trim() || platform;

  const description = (item.input.description ?? "").trim();
  const tags = (item.input.tags ?? []).map((tag) => tag.replace(/^#/, "")).filter(Boolean).join(",");

  const args = [
    python,
    cli,
    platform,
    "upload-video",
    "--account", account,
    "--file", item.input.videoPath,
    "--title", item.input.title
  ];

  if (description) {
    args.push("--desc", description);
  }
  if (tags) {
    args.push("--tags", tags);
  }
  if (platform === "bilibili") {
    // B站 upload-video 要求 desc 与 tid 必需;desc 缺失时补空串,避免 CLI 直接报参数错。
    if (!description) {
      args.push("--desc", "");
    }
    args.push("--tid", (env.SOCIAL_AUTO_UPLOAD_BILIBILI_TID ?? "").trim() || "249");
  }

  return args;
}

/** 供提示与 UI 使用:检查命令依赖的配置是否齐。 */
export function describeSocialAutoUploadConfig(
  item: PublishQueueItem,
  env: Record<string, string | undefined> = process.env
): { dir?: string; python: string; cli: string; account: string; sessionDir?: string; missing: string[] } {
  const platform = item.input.platform;
  const dir = (env.SOCIAL_AUTO_UPLOAD_DIR ?? "").trim() || undefined;
  const python = (env.SOCIAL_AUTO_UPLOAD_PYTHON ?? "").trim()
    || (dir ? `${dir}\\.venv\\Scripts\\python.exe` : "python");
  const cli = (env.SOCIAL_AUTO_UPLOAD_CLI ?? "").trim()
    || (dir ? `${dir}\\sau_cli.py` : "sau_cli.py");
  const accountKey = `SOCIAL_AUTO_UPLOAD_ACCOUNT_${platform.toUpperCase()}`;
  const account = (env[accountKey] ?? "").trim() || platform;
  const sessionDir = (env.SOCIAL_AUTO_UPLOAD_SESSION_DIR ?? "").trim()
    || (dir ? `${dir}\\cookies` : undefined);

  const missing: string[] = [];
  if (!dir) missing.push("SOCIAL_AUTO_UPLOAD_DIR");
  if (!(env[accountKey] ?? "").trim()) missing.push(accountKey);

  return { dir, python, cli, account, sessionDir, missing };
}

export async function dispatchPublishQueueItem(
  input: PublishDispatchInput,
  deps: {
    env?: Record<string, string | undefined>;
    fetch?: typeof fetch;
    readPublishQueue?: typeof readPublishQueue;
    writePublishQueue?: typeof writePublishQueue;
    runPublishCommand?: RunPublishCommand;
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
    return dispatchSocialAutoUpload(item, queue, index, mode, liveEnabled, env, deps.runPublishCommand, deps.writePublishQueue);
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

/**
 * social-auto-upload 执行分支(国内平台浏览器自动化)。
 *
 * 三重闸门全部满足才真正执行,默认只给命令预览:
 *   1. SOCIAL_AUTO_UPLOAD_EXECUTE=true —— 明确启用外部执行
 *   2. PUBLISH_LIVE_ENABLED=true —— 项目既有总闸门
 *   3. mode=live —— 调用方显式指定
 * 这是为了守住项目「绝不静默上传」的原则。
 */
async function dispatchSocialAutoUpload(
  item: PublishQueueItem,
  queue: PublishQueueState,
  index: number,
  mode: PublishDispatchMode,
  liveEnabled: boolean,
  env: Record<string, string | undefined>,
  run: RunPublishCommand = defaultRunPublishCommand,
  writeQueue: typeof writePublishQueue = writePublishQueue
): Promise<PublishDispatchResult> {
  const commandPreview = buildSocialAutoUploadCommand(item, env);
  const config = describeSocialAutoUploadConfig(item, env);
  const base = {
    id: item.id,
    platform: item.input.platform,
    adapter: "social-auto-upload" as const,
    mode,
    liveEnabled,
    commandPreview
  };

  if (!config.dir) {
    return {
      ...base,
      status: "blocked",
      sent: false,
      message: "缺少 SOCIAL_AUTO_UPLOAD_DIR,无法定位 social-auto-upload。安装与配置见 docs/MANUAL_SETUP.md。"
    };
  }

  if (!existsSync(config.cli)) {
    return {
      ...base,
      status: "blocked",
      sent: false,
      message: `找不到 ${config.cli}。请确认 SOCIAL_AUTO_UPLOAD_DIR 指向 social-auto-upload 安装目录。`
    };
  }

  const executeEnabled = env.SOCIAL_AUTO_UPLOAD_EXECUTE === "true";
  if (!executeEnabled || !liveEnabled || mode !== "live") {
    const reasons: string[] = [];
    if (!executeEnabled) reasons.push("SOCIAL_AUTO_UPLOAD_EXECUTE 未设为 true");
    if (!liveEnabled) reasons.push("PUBLISH_LIVE_ENABLED 未设为 true");
    if (mode !== "live") reasons.push("mode 不是 live");
    return {
      ...base,
      status: "preview",
      sent: false,
      message: `已生成可执行命令,未执行(${reasons.join(";")})。三个闸门全开才会真正上传。`
    };
  }

  const timeoutMs = Number(env.SOCIAL_AUTO_UPLOAD_TIMEOUT_MS ?? "") || 600_000;
  const result = await run(commandPreview, { cwd: config.dir, timeoutMs });
  const trimmed = {
    code: result.code,
    stdout: result.stdout.slice(-4000),
    stderr: result.stderr.slice(-4000)
  };

  if (result.code !== 0) {
    return {
      ...base,
      status: "blocked",
      sent: false,
      response: trimmed,
      message: `social-auto-upload 执行失败(code=${result.code})。stderr 见 response。`
    };
  }

  const now = new Date().toISOString();
  queue.items[index] = { ...item, status: "published", updatedAt: now };
  await writeQueue(queue);

  return {
    ...base,
    status: "sent",
    sent: true,
    response: trimmed,
    message: "social-auto-upload 已执行完成。请到平台后台确认作品状态。"
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
