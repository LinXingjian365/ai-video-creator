export type ToolkitStage =
  | "trend"
  | "collect"
  | "download"
  | "transcribe"
  | "analyze"
  | "edit"
  | "render"
  | "publish"
  | "review"
  | "orchestrate";

export interface CreatorTool {
  id: string;
  name: string;
  stage: ToolkitStage;
  priority: "core" | "recommended" | "optional" | "experimental";
  source: string;
  url: string;
  install?: string;
  env?: string[];
  why: string;
  integrationPlan: string[];
  notes: string[];
}

export const creatorToolkit: CreatorTool[] = [
  {
    id: "deepseek",
    name: "DeepSeek API",
    stage: "analyze",
    priority: "core",
    source: "DeepSeek OpenAI-compatible API",
    url: "https://api-docs.deepseek.com/zh-cn/",
    env: ["DEEPSEEK_API_KEY"],
    why: "Current default LLM provider for trend explanation, topic cards and planning prompts. It uses an OpenAI-compatible Chat Completions shape.",
    integrationPlan: ["trend intelligence analysis", "viral logic explanation", "topic card generation", "future script/planning prompts"],
    notes: ["Set LLM_PROVIDER=deepseek.", "Default base URL is https://api.deepseek.com.", "Use environment variables; never hardcode API keys."]
  },
  {
    id: "llm-gateway-profiles",
    name: "LLM gateway profiles",
    stage: "analyze",
    priority: "recommended",
    source: "OpenAI-compatible / Anthropic-compatible gateways",
    url: "https://api-docs.deepseek.com/zh-cn/",
    env: ["ARK_API_KEY", "ANTHROPIC_API_KEY", "GPT_GATEWAY_API_KEY"],
    why: "Keeps Doubao Ark, Claude gateways and GPT gateways pluggable behind one LLMClient interface.",
    integrationPlan: ["LLM_PROVIDER=doubao-ark", "LLM_PROVIDER=claude-gateway", "LLM_PROVIDER=gpt-gateway"],
    notes: ["Ark/GPT gateways use Chat Completions.", "Claude gateways use the Anthropic messages shape.", "Keep provider-specific keys in .env.local."]
  },
  {
    id: "yt-dlp",
    name: "yt-dlp",
    stage: "download",
    priority: "core",
    source: "yt-dlp/yt-dlp",
    url: "https://github.com/yt-dlp/yt-dlp",
    install: "python -m pip install -U yt-dlp",
    why: "High-star, actively maintained audio/video downloader and metadata extractor for many sites.",
    env: ["YTDLP_COOKIES_PATH"],
    integrationPlan: ["reference video metadata", "authorized download/import", "subtitle-first transcript extraction", "/api/materials/import"],
    notes: ["Use only for content you are allowed to download or analyze.", "Some platforms require cookies or official access.", "The local API saves media, thumbnail, subtitles, info.json, and manifest.json under workspace/input/references."]
  },
  {
    id: "firecrawl",
    name: "Firecrawl",
    stage: "collect",
    priority: "recommended",
    source: "firecrawl/firecrawl",
    url: "https://github.com/firecrawl/firecrawl",
    install: "npm install @mendable/firecrawl-js",
    env: ["FIRECRAWL_API_KEY"],
    why: "Mature web search/scrape/crawl API for turning web pages into clean Markdown or structured data.",
    integrationPlan: ["trend source collection", "article/source grounding", "competitor page extraction"],
    notes: ["AGPL if self-hosted; hosted API needs key."]
  },
  {
    id: "bilibili-public-ranking",
    name: "Bilibili Public Ranking Source",
    stage: "trend",
    priority: "core",
    source: "Bilibili public web-interface APIs",
    url: "https://api.bilibili.com",
    env: ["BILI_COOKIE"],
    why: "First built-in real trend source. Uses Bilibili ranking and popular APIs for live high-traffic video signals.",
    integrationPlan: ["Bilibili category ranking", "popular feed fallback", "real metrics for viral scoring"],
    notes: ["BILI_COOKIE is optional but recommended when Bilibili returns risk-control codes such as -352.", "Do not bypass platform rules or scrape at high volume."]
  },
  {
    id: "tikhub",
    name: "TikHub API",
    stage: "trend",
    priority: "recommended",
    source: "TikHub/TikHub-API-Python-SDK",
    url: "https://github.com/TikHub/TikHub-API-Python-SDK",
    install: "pip install tikhub",
    env: ["TIKHUB_API_KEY"],
    why: "Unified data API for Douyin, Kuaishou, Bilibili, TikTok, Xiaohongshu and more.",
    integrationPlan: ["hot video search", "creator/video stats", "comments and trend inputs", "viral scoring features"],
    notes: ["Commercial/third-party API; verify terms and quotas before production use."]
  },
  {
    id: "media-crawler-mcp",
    name: "MediaCrawler MCP Service",
    stage: "collect",
    priority: "optional",
    source: "mcp-service/media-crawler-mcp-service",
    url: "https://github.com/mcp-service/media-crawler-mcp-service",
    install: "uv sync",
    why: "MCP-style multi-platform crawler for Bilibili, Xiaohongshu, Douyin and related public data.",
    integrationPlan: ["MCP trend tools", "Bilibili/XHS public post analysis", "comments and creator detail"],
    notes: ["Use minimal request volume and authenticated browser context where required."]
  },
  {
    id: "social-post-extractor-mcp",
    name: "Social Post Extractor MCP",
    stage: "analyze",
    priority: "optional",
    source: "JNHFlow21/social-post-extractor-mcp",
    url: "https://github.com/JNHFlow21/social-post-extractor-mcp",
    install: "uv sync",
    env: ["DASHSCOPE_API_KEY"],
    why: "Extracts scripts and metadata from Douyin, Xiaohongshu and Bilibili links with ASR/OCR outputs.",
    integrationPlan: ["reference script extraction", "info.json/script.md import", "owner post review"],
    notes: ["Needs cloud ASR/vision key for full transcript extraction."]
  },
  {
    id: "faster-whisper",
    name: "faster-whisper",
    stage: "transcribe",
    priority: "core",
    source: "SYSTRAN/faster-whisper",
    url: "https://github.com/SYSTRAN/faster-whisper",
    install: "pip install faster-whisper",
    why: "Fast local Whisper implementation with CTranslate2; suitable for batch transcripts.",
    integrationPlan: ["word timestamps", "caption timing", "hook and retention analysis", "reference video transcript"],
    notes: ["GPU helps; CPU int8 mode can work for small batches."]
  },
  {
    id: "whisperx",
    name: "WhisperX",
    stage: "transcribe",
    priority: "optional",
    source: "m-bain/whisperX",
    url: "https://github.com/m-bain/whisperX",
    install: "pip install whisperx",
    why: "Accurate word-level alignment and diarization for multi-speaker footage.",
    integrationPlan: ["speaker labels", "precise karaoke captions", "interview/long-video clipping"],
    notes: ["Heavier setup; use after faster-whisper baseline works."]
  },
  {
    id: "pyscenedetect",
    name: "PySceneDetect",
    stage: "analyze",
    priority: "core",
    source: "Breakthrough/PySceneDetect",
    url: "https://www.scenedetect.com/docs/latest/",
    install: "pip install scenedetect[opencv]",
    why: "Reliable shot/scene boundary detection for automatic video segmentation.",
    integrationPlan: ["scene boundary detection", "thumbnail extraction", "cut point validation"],
    notes: ["Thresholds need per-niche tuning."]
  },
  {
    id: "auto-editor",
    name: "Auto-Editor",
    stage: "edit",
    priority: "recommended",
    source: "WyattBlue/auto-editor",
    url: "https://github.com/WyattBlue/auto-editor",
    install: "pip install auto-editor",
    why: "Automatic silence and dead-air cutting for talking-head material.",
    integrationPlan: ["rough silence cut", "jump-cut baseline", "reviewable timeline export"],
    notes: ["Keep human review for natural pauses and emotion."]
  },
  {
    id: "remotion",
    name: "Remotion",
    stage: "render",
    priority: "core",
    source: "remotion-dev/remotion",
    url: "https://www.remotion.dev/",
    install: "npm install remotion @remotion/renderer",
    why: "React-based programmable video rendering for captions, overlays and reusable templates.",
    integrationPlan: ["caption templates", "data cards", "platform variants", "final render layer"],
    notes: ["Best as the repeatable graphics/rendering layer."]
  },
  {
    id: "opentimelineio",
    name: "OpenTimelineIO",
    stage: "edit",
    priority: "optional",
    source: "AcademySoftwareFoundation/OpenTimelineIO",
    url: "https://opentimelineio.readthedocs.io/en/latest/",
    install: "pip install OpenTimelineIO",
    why: "Editorial timeline interchange format for structured clip decisions.",
    integrationPlan: ["decision JSON export", "NLE handoff", "timeline diffing"],
    notes: ["Stores timeline references, not media files."]
  },
  {
    id: "jianying-mcp",
    name: "JianYing MCP",
    stage: "edit",
    priority: "recommended",
    source: "hey-jian-wei/jianying-mcp",
    url: "https://github.com/hey-jian-wei/jianying-mcp",
    install: "uv sync",
    why: "Exports editable JianYing/CapCut-style draft plans and effects through MCP.",
    integrationPlan: ["editable draft bridge", "tracks/text/effects", "manual polish handoff"],
    notes: ["Requires local paths and ID handoff discipline."]
  },
  {
    id: "social-auto-upload",
    name: "social-auto-upload",
    stage: "publish",
    priority: "core",
    source: "dreammis/social-auto-upload",
    url: "https://github.com/dreammis/social-auto-upload",
    install: "uv tool install social-auto-upload",
    why: "Strong fit for China platforms: Douyin, Kuaishou, Bilibili, Xiaohongshu, Video Account and more.",
    integrationPlan: ["Douyin/Kuaishou/Bilibili publishing", "scheduled posts", "creator-center browser automation"],
    notes: ["Needs local login/session setup; use dry-run before real publish."]
  },
  {
    id: "self-media-uper",
    name: "self-media-uper",
    stage: "review",
    priority: "recommended",
    source: "lzy198436/self-media-uper",
    url: "https://github.com/lzy198436/self-media-uper",
    install: "uv sync",
    why: "Material-folder-to-multi-platform publishing plus post statistics collection for Chinese platforms.",
    integrationPlan: ["material folder convention", "multi-platform publish pack", "post metrics collection"],
    notes: ["Good pattern for your publish/review loop; verify repo maturity before relying on it in production."]
  },
  {
    id: "postiz",
    name: "Postiz",
    stage: "publish",
    priority: "recommended",
    source: "gitroomhq/postiz-app",
    url: "https://github.com/gitroomhq/postiz-app",
    install: "docker compose up",
    env: ["POSTIZ_URL", "POSTIZ_API_KEY"],
    why: "Self-hosted social scheduling with API, analytics and n8n integration.",
    integrationPlan: ["international platform scheduling", "analytics import", "agentic publish queue"],
    notes: ["Better for YouTube/TikTok/Instagram/X/LinkedIn than domestic creator centers."]
  },
  {
    id: "n8n",
    name: "n8n",
    stage: "orchestrate",
    priority: "recommended",
    source: "n8n-io/n8n",
    url: "https://github.com/n8n-io/n8n",
    install: "npm install n8n -g",
    env: ["APP_BASE_URL", "N8N_WEBHOOK_URL", "N8N_WEBHOOK_SECRET"],
    why: "Mature workflow automation layer for scheduled jobs, webhooks, approvals and retries.",
    integrationPlan: ["daily trend job", "render queue", "publish approval", "analytics sync"],
    notes: ["Use this when the local app graduates from manual runs to timed automation."]
  },
  {
    id: "reelstack-pattern",
    name: "ReelStack pattern",
    stage: "render",
    priority: "experimental",
    source: "jurczykpawel/reelstack",
    url: "https://github.com/jurczykpawel/reelstack",
    why: "Modern reference architecture for script-to-reel using REST API, Remotion, captions, queues and n8n.",
    integrationPlan: ["REST API shape", "caption presets", "queue architecture"],
    notes: ["Use as architecture inspiration; do not bind as a hard dependency yet."]
  },
  {
    id: "openreels-pattern",
    name: "OpenReels pattern",
    stage: "render",
    priority: "experimental",
    source: "tsensei/OpenReels",
    url: "https://github.com/tsensei/OpenReels",
    why: "End-to-end topic-to-short pattern with research, script, voice, visuals, music, captions and critique.",
    integrationPlan: ["AI critic loop", "scene prompts", "quality gate"],
    notes: ["Good pattern for generated videos; your core workflow should still prioritize real/reference footage."]
  }
];

export function toolsByStage() {
  return creatorToolkit.reduce<Record<ToolkitStage, CreatorTool[]>>((acc, tool) => {
    acc[tool.stage] = [...(acc[tool.stage] ?? []), tool];
    return acc;
  }, {} as Record<ToolkitStage, CreatorTool[]>);
}

export function requiredEnvVars() {
  return [...new Set(creatorToolkit.flatMap((tool) => tool.env ?? []))].sort();
}
