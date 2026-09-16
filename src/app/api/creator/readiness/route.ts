import { spawnSync } from "node:child_process";
import { NextResponse } from "next/server";
import { creatorToolkit, requiredEnvVars } from "@/lib/creator-toolkit";
import { getYtDlpInvocation } from "@/lib/materials/yt-dlp";
import { getVideoToolsPython } from "@/lib/python-tools";

export const runtime = "nodejs";

export async function GET() {
  const ytDlp = getYtDlpInvocation();
  const sceneDetect = pythonImportVersionCheck("scenedetect");
  const autoEditor = pythonImportVersionCheck("auto_editor");
  const fasterWhisper = pythonImportVersionCheck("faster_whisper");
  const commandChecks = [
    { id: "node", command: "node", args: ["--version"], stage: "base" },
    { id: "npm", command: "npm", args: ["--version"], stage: "base" },
    { id: "python", command: getVideoToolsPython(), args: ["--version"], stage: "python" },
    { id: "uv", command: "uv", args: ["--version"], stage: "python" },
    { id: "yt-dlp", command: ytDlp.command, args: [...ytDlp.prefixArgs, "--version"], stage: "download" },
    { id: "pyscenedetect", command: sceneDetect.command, args: sceneDetect.args, stage: "analyze" },
    { id: "auto-editor", command: autoEditor.command, args: autoEditor.args, stage: "edit" },
    { id: "faster-whisper", command: fasterWhisper.command, args: fasterWhisper.args, stage: "transcribe" },
    { id: "ffmpeg", command: "ffmpeg", args: ["-version"], stage: "edit" },
    { id: "n8n", command: "n8n", args: ["--version"], stage: "orchestrate" }
  ];

  const commands = commandChecks.map((check) => {
    const invocation = commandInvocation(check.command, check.args);
    const result = spawnSync(invocation.command, invocation.args, {
      encoding: "utf8",
      timeout: 5000,
      windowsHide: true
    });

    return {
      ...check,
      ok: result.status === 0,
      output: (result.stdout || result.stderr || "").split(/\r?\n/)[0] ?? "",
      error: result.error?.message
    };
  });

  const env = requiredEnvVars().map((name) => ({
    name,
    ok: Boolean(process.env[name]),
    hint: envHint(name)
  }));

  const llmProvider = (process.env.LLM_PROVIDER ?? "deepseek").toLowerCase();
  const llmConfig = llmProviderConfig(llmProvider);
  const llm = {
    provider: llmProvider,
    keyName: llmConfig.keyName,
    ok: Boolean(process.env[llmConfig.keyName]),
    hint: llmConfig.hint
  };

  const stages = creatorToolkit.reduce<Record<string, { total: number; core: number; readyHints: string[] }>>((acc, tool) => {
    const current = acc[tool.stage] ?? { total: 0, core: 0, readyHints: [] };
    current.total += 1;
    current.core += tool.priority === "core" || tool.priority === "recommended" ? 1 : 0;
    current.readyHints.push(`${tool.name}: ${tool.integrationPlan[0] ?? tool.why}`);
    acc[tool.stage] = current;
    return acc;
  }, {});

  return NextResponse.json({
    commands,
    env,
    llm,
    stages,
    nextSteps: [
      "Install missing local commands first: python, uv, yt-dlp, PySceneDetect, faster-whisper, ffmpeg, and n8n.",
      "For trend intelligence, configure LLM_PROVIDER plus the matching provider key such as DEEPSEEK_API_KEY, ARK_API_KEY, ANTHROPIC_API_KEY, or GPT_GATEWAY_API_KEY.",
      "Use dry-run publishing before any real platform upload.",
      "After credentials are configured, test one Bilibili category report before expanding to Douyin/Kuaishou."
    ]
  });
}

function commandInvocation(command: string, args: string[]) {
  if (process.platform === "win32" && (command === "npm" || command === "n8n")) {
    return { command: "cmd.exe", args: ["/d", "/s", "/c", command, ...args] };
  }

  return { command, args };
}

function pythonImportVersionCheck(moduleName: string) {
  return {
    command: getVideoToolsPython(),
    args: ["-c", `import ${moduleName}; print(getattr(${moduleName}, '__version__', 'ok'))`]
  };
}

function llmProviderConfig(provider: string) {
  if (provider === "deepseek") {
    return {
      keyName: "DEEPSEEK_API_KEY",
      hint: "DeepSeek OpenAI-compatible mode. Configure DEEPSEEK_API_KEY, optional DEEPSEEK_BASE_URL, DEEPSEEK_MODEL, DEEPSEEK_THINKING, and DEEPSEEK_REASONING_EFFORT."
    };
  }
  if (provider === "anthropic" || provider === "claude-gateway") {
    return {
      keyName: "ANTHROPIC_API_KEY",
      hint: "Anthropic-compatible mode. Configure ANTHROPIC_API_KEY, optional ANTHROPIC_BASE_URL, and ANTHROPIC_MODEL. Claude gateways can use this shape."
    };
  }
  if (provider === "doubao-ark" || provider === "ark") {
    return {
      keyName: "ARK_API_KEY",
      hint: "Doubao Ark OpenAI-compatible mode. Configure ARK_API_KEY, ARK_BASE_URL, and ARK_MODEL."
    };
  }
  if (provider === "gpt-gateway") {
    return {
      keyName: "GPT_GATEWAY_API_KEY",
      hint: "GPT gateway OpenAI-compatible mode. Configure GPT_GATEWAY_API_KEY, GPT_GATEWAY_BASE_URL, and GPT_GATEWAY_MODEL."
    };
  }

  return {
    keyName: "OPENAI_API_KEY",
    hint: "OpenAI-compatible mode. Configure OPENAI_API_KEY, OPENAI_BASE_URL, and OPENAI_MODEL. bmapi-style gateways can use this shape."
  };
}

function envHint(name: string) {
  const hints: Record<string, string> = {
    FIRECRAWL_API_KEY: "Web search/scrape provider for trend and source collection.",
    EXA_API_KEY: "Neural search provider for trend and source discovery.",
    TIKHUB_API_KEY: "Unified social data provider for Douyin/Kuaishou/Bilibili/TikTok style data.",
    BILI_COOKIE: "Optional Bilibili browser cookie. Helps when public ranking APIs return risk-control codes such as -352.",
    YTDLP_BINARY: "Optional absolute path to yt-dlp. On Windows the app defaults to python -m yt_dlp when empty.",
    VIDEO_TOOLS_PYTHON: "Optional Python executable for yt-dlp, PySceneDetect, Auto-Editor, and faster-whisper. Defaults to the py312 conda env on this machine.",
    YTDLP_COOKIES_PATH: "Optional cookies.txt path for yt-dlp when importing authorized reference videos from platforms that require login.",
    YTDLP_TIMEOUT_MS: "Optional yt-dlp process timeout. Default is 120000ms.",
    DASHSCOPE_API_KEY: "ASR/OCR/vision provider for extractor workflows.",
    POSTIZ_URL: "Self-hosted or hosted Postiz API base URL.",
    POSTIZ_API_KEY: "Postiz API token for scheduled publishing and analytics.",
    APP_BASE_URL: "Public/local base URL that n8n can call back into, for example http://127.0.0.1:5182.",
    N8N_WEBHOOK_URL: "n8n webhook for scheduled automation.",
    N8N_WEBHOOK_SECRET: "Optional shared secret sent as X-AI-Video-Secret when triggering n8n."
  };
  return hints[name] ?? "Optional provider credential.";
}
