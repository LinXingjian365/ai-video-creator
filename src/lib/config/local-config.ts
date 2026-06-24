import { promises as fs } from "node:fs";
import path from "node:path";

export const LOCAL_CONFIG_CONFIRM_TEXT = "CONFIRM_LOCAL_CONFIG_WRITE";

export interface LocalConfigFieldDefinition {
  key: string;
  label: string;
  help: string;
  secret?: boolean;
  kind?: "text" | "password" | "select";
  options?: string[];
  placeholder?: string;
}

export interface LocalConfigField extends LocalConfigFieldDefinition {
  configured: boolean;
  value?: string;
}

export interface LocalConfigGroup {
  id: string;
  title: string;
  description: string;
  fields: LocalConfigField[];
}

const CONFIG_GROUPS: Array<Omit<LocalConfigGroup, "fields"> & { fields: LocalConfigFieldDefinition[] }> = [
  {
    id: "llm",
    title: "AI 模型",
    description: "当前主模型与兼容网关。保存后可立即运行最小生成探针。",
    fields: [
      { key: "LLM_PROVIDER", label: "模型提供方", help: "DeepSeek 为当前默认主链路。", kind: "select", options: ["deepseek", "openai", "gpt-gateway", "doubao-ark", "anthropic", "claude-gateway"] },
      { key: "DEEPSEEK_API_KEY", label: "DeepSeek API Key", help: "仅写入本机 .env.local，页面永不回显。", secret: true, kind: "password" },
      { key: "DEEPSEEK_BASE_URL", label: "DeepSeek Base URL", help: "官方默认 https://api.deepseek.com。", placeholder: "https://api.deepseek.com" },
      { key: "DEEPSEEK_MODEL", label: "DeepSeek 模型", help: "填写账号实际可用的模型名。", placeholder: "deepseek-chat" },
      { key: "OPENAI_API_KEY", label: "OpenAI/中转 Key", help: "用于 openai 兼容模式。", secret: true, kind: "password" },
      { key: "OPENAI_BASE_URL", label: "OpenAI/中转 Base URL", help: "需包含兼容 API 的 /v1 前缀。", placeholder: "https://example.com/v1" },
      { key: "OPENAI_MODEL", label: "OpenAI/中转模型", help: "填写网关支持的模型名。" },
      { key: "GPT_GATEWAY_API_KEY", label: "GPT Gateway Key", help: "命名网关配置，可与 OpenAI 配置并存。", secret: true, kind: "password" },
      { key: "GPT_GATEWAY_BASE_URL", label: "GPT Gateway URL", help: "OpenAI Chat Completions 兼容地址。" },
      { key: "GPT_GATEWAY_MODEL", label: "GPT Gateway 模型", help: "网关提供的模型名。" },
      { key: "ARK_API_KEY", label: "豆包 Ark Key", help: "火山方舟 OpenAI 兼容凭据。", secret: true, kind: "password" },
      { key: "ARK_BASE_URL", label: "豆包 Ark URL", help: "默认 https://ark.cn-beijing.volces.com/api/v3。" },
      { key: "ARK_MODEL", label: "豆包 Ark 模型", help: "填写已开通的 endpoint/model。" },
      { key: "ANTHROPIC_API_KEY", label: "Claude/中转 Key", help: "Anthropic Messages API 兼容凭据。", secret: true, kind: "password" },
      { key: "ANTHROPIC_BASE_URL", label: "Claude/中转 URL", help: "官方或兼容 Anthropic Messages API 地址。" },
      { key: "ANTHROPIC_MODEL", label: "Claude 模型", help: "填写服务实际支持的模型名。" }
    ]
  },
  {
    id: "discovery",
    title: "热点与联网证据",
    description: "免费自托管路径优先，付费数据源作为补充。",
    fields: [
      { key: "TTD_ENABLED", label: "启用 TikTokDownloader", help: "抖音免费热榜服务。", kind: "select", options: ["true", "false"] },
      { key: "TTD_BASE_URL", label: "TTD 地址", help: "本机默认 http://127.0.0.1:5555。" },
      { key: "KSD_ENABLED", label: "启用 KS-Downloader", help: "可选的快手详情服务。", kind: "select", options: ["true", "false"] },
      { key: "KSD_BASE_URL", label: "KSD 地址", help: "本机建议 http://127.0.0.1:5557。" },
      { key: "TIKHUB_API_KEY", label: "TikHub Key", help: "快手热榜及部分搜索接口可能计费。", secret: true, kind: "password" },
      { key: "EXA_API_KEY", label: "Exa Key", help: "联网事实与案例搜索。", secret: true, kind: "password" },
      { key: "FIRECRAWL_API_KEY", label: "Firecrawl Key", help: "网页搜索与抓取备用。", secret: true, kind: "password" },
      { key: "YOUTUBE_API_KEY", label: "YouTube Data API Key", help: "YouTube 热点榜需要官方 Data API v3。", secret: true, kind: "password" }
    ]
  },
  {
    id: "automation",
    title: "编排与发布",
    description: "发布始终保留人工批准闸门；这里仅配置连接能力。",
    fields: [
      { key: "APP_BASE_URL", label: "应用回调地址", help: "n8n 回调本应用的地址。", placeholder: "http://127.0.0.1:5182" },
      { key: "N8N_WEBHOOK_URL", label: "n8n Webhook", help: "完整 webhook URL。" },
      { key: "N8N_WEBHOOK_SECRET", label: "n8n 共享密钥", help: "作为 X-AI-Video-Secret 发送。", secret: true, kind: "password" },
      { key: "POSTIZ_URL", label: "Postiz API 地址", help: "自托管默认 http://localhost:5000/api。" },
      { key: "POSTIZ_API_KEY", label: "Postiz API Key", help: "从本地 Postiz 设置中生成。", secret: true, kind: "password" },
      { key: "POSTIZ_INTEGRATION_ID_DOUYIN", label: "抖音渠道 ID", help: "完成渠道 OAuth 后获得。" },
      { key: "POSTIZ_INTEGRATION_ID_KUAISHOU", label: "快手渠道 ID", help: "完成渠道 OAuth 后获得。" },
      { key: "POSTIZ_INTEGRATION_ID_BILIBILI", label: "B站渠道 ID", help: "完成渠道 OAuth 后获得。" },
      { key: "PUBLISH_LIVE_ENABLED", label: "允许草稿分发", help: "仍需队列人工批准；建议保持 false。", kind: "select", options: ["false", "true"] }
    ]
  },
  {
    id: "media",
    title: "生成与本地工具",
    description: "视频生成、语音、识别与剪映草稿能力。",
    fields: [
      { key: "FAL_KEY", label: "fal.ai Key", help: "可选的 AI 视频/图像生成。", secret: true, kind: "password" },
      { key: "ELEVENLABS_API_KEY", label: "ElevenLabs Key", help: "可选云端配音；本地 Edge TTS 无需 Key。", secret: true, kind: "password" },
      { key: "DASHSCOPE_API_KEY", label: "DashScope Key", help: "可选 ASR/OCR/视觉模型。", secret: true, kind: "password" },
      { key: "VIDEO_TOOLS_PYTHON", label: "视频工具 Python", help: "yt-dlp、场景检测与转写使用的 Python。" },
      { key: "YTDLP_COOKIES_PATH", label: "yt-dlp cookies.txt", help: "仅导入已获授权、需登录的素材时使用。" },
      { key: "JIANYING_PYTHON", label: "剪映草稿 Python", help: "pyJianYingDraft 使用的解释器。" },
      { key: "JIANYING_DRAFTS_DIR", label: "剪映草稿目录", help: "剪映专业版草稿目录。" }
    ]
  }
];

export const ALLOWED_LOCAL_CONFIG_KEYS = new Set(CONFIG_GROUPS.flatMap((group) => group.fields.map((field) => field.key)));

export function buildConfigSnapshot(env: Record<string, string | undefined> = process.env) {
  return {
    groups: CONFIG_GROUPS.map((group) => ({
      ...group,
      fields: group.fields.map((field): LocalConfigField => {
        const current = env[field.key]?.trim() ?? "";
        return {
          ...field,
          configured: current.length > 0,
          ...(!field.secret && current ? { value: current } : {})
        };
      })
    }))
  };
}

export function validateConfigUpdates(input: unknown): Record<string, string> {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("配置值必须是对象。");
  }
  const entries = Object.entries(input as Record<string, unknown>);
  if (entries.length === 0 || entries.length > ALLOWED_LOCAL_CONFIG_KEYS.size) {
    throw new Error("没有可保存的配置。");
  }
  const result: Record<string, string> = {};
  for (const [key, value] of entries) {
    if (!ALLOWED_LOCAL_CONFIG_KEYS.has(key)) {
      throw new Error(`不允许写入配置项 ${key}。`);
    }
    if (typeof value !== "string" || value.length > 10_000 || value.includes("\0")) {
      throw new Error(`配置项 ${key} 的值无效。`);
    }
    result[key] = value.trim();
  }
  return result;
}

function dotenvValue(value: string): string {
  return /^[A-Za-z0-9_./:@-]*$/.test(value) ? value : JSON.stringify(value).replace(/\$/g, "\\$");
}

export function updateDotEnvContent(content: string, updates: Record<string, string>): string {
  const newline = content.includes("\r\n") ? "\r\n" : "\n";
  const lines = content ? content.split(/\r?\n/) : [];
  const remaining = new Set(Object.keys(updates));
  const emitted = new Set<string>();
  const next: string[] = [];

  for (const line of lines) {
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=/);
    const key = match?.[1];
    if (!key || !(key in updates)) {
      next.push(line);
      continue;
    }
    if (!emitted.has(key)) {
      next.push(`${key}=${dotenvValue(updates[key])}`);
      emitted.add(key);
      remaining.delete(key);
    }
  }

  if (remaining.size > 0 && next.length > 0 && next[next.length - 1] !== "") {
    next.push("");
  }
  for (const key of remaining) {
    next.push(`${key}=${dotenvValue(updates[key])}`);
  }
  return `${next.join(newline).replace(new RegExp(`${newline}+$`), "")}${newline}`;
}

export function isAllowedLocalConfigRequest(input: { host: string | null; origin: string | null }): boolean {
  if (!input.host || !input.origin) return false;
  try {
    const origin = new URL(input.origin);
    const host = new URL(`http://${input.host}`);
    const loopback = new Set(["127.0.0.1", "localhost", "::1"]);
    return loopback.has(host.hostname) && loopback.has(origin.hostname) && host.host === origin.host;
  } catch {
    return false;
  }
}

export function isAllowedLocalConfigReadRequest(input: { host: string | null; origin: string | null }): boolean {
  if (!input.host) return false;
  try {
    const host = new URL(`http://${input.host}`);
    const loopback = new Set(["127.0.0.1", "localhost", "::1"]);
    if (!loopback.has(host.hostname)) return false;
    return input.origin ? isAllowedLocalConfigRequest(input) : true;
  } catch {
    return false;
  }
}

export async function writeLocalConfig(updates: Record<string, string>, envPath = path.join(process.cwd(), ".env.local")) {
  let current = "";
  try {
    current = await fs.readFile(envPath, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  const next = updateDotEnvContent(current, updates);
  const tempPath = `${envPath}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(tempPath, next, { encoding: "utf8", mode: 0o600 });
  await fs.rename(tempPath, envPath);
  for (const [key, value] of Object.entries(updates)) {
    if (value) process.env[key] = value;
    else delete process.env[key];
  }
}
