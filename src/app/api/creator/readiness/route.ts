import { spawnSync } from "node:child_process";
import { NextResponse } from "next/server";
import { creatorToolkit, requiredEnvVars } from "@/lib/creator-toolkit";

export const runtime = "nodejs";

const commandChecks = [
  { id: "node", command: "node", args: ["--version"], stage: "base" },
  { id: "npm", command: "npm", args: ["--version"], stage: "base" },
  { id: "python", command: "python", args: ["--version"], stage: "python" },
  { id: "uv", command: "uv", args: ["--version"], stage: "python" },
  { id: "yt-dlp", command: "yt-dlp", args: ["--version"], stage: "download" },
  { id: "ffmpeg", command: "ffmpeg", args: ["-version"], stage: "edit" },
  { id: "n8n", command: "n8n", args: ["--version"], stage: "orchestrate" }
];

export async function GET() {
  const commands = commandChecks.map((check) => {
    const result = spawnSync(check.command, check.args, {
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
    stages,
    nextSteps: [
      "Install missing local commands first: python, uv, yt-dlp, ffmpeg, n8n.",
      "Add API keys to .env.local only after you decide which data providers to use.",
      "Run a dry-run publish before any real platform upload.",
      "After credentials are configured, use one known reference video and one owned raw clip for the first full-chain test."
    ]
  });
}

function envHint(name: string) {
  const hints: Record<string, string> = {
    FIRECRAWL_API_KEY: "Web search/scrape provider for trend and source collection.",
    TIKHUB_API_KEY: "Unified social data provider for Douyin/Kuaishou/Bilibili/TikTok style data.",
    DASHSCOPE_API_KEY: "ASR/OCR/vision provider for social-post-extractor workflows.",
    POSTIZ_URL: "Self-hosted or hosted Postiz API base URL.",
    POSTIZ_API_KEY: "Postiz API token for scheduled publishing and analytics.",
    N8N_WEBHOOK_URL: "n8n webhook for scheduled automation."
  };
  return hints[name] ?? "Optional provider credential.";
}
