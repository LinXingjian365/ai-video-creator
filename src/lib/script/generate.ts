import type { LLMClient } from "@/lib/llm/client";

export interface ScriptBeat {
  time: string;       // 时间区间, 如 "0-3s"
  shot: string;       // 画面/分镜
  voiceover: string;  // 口播台词
  caption: string;    // 字幕
}

export interface ScriptDraft {
  titles: string[];        // 候选标题
  hook: string;            // 开场钩子
  beats: ScriptBeat[];     // 分镜脚本节拍
  bgm: string;             // 配乐建议
  tags: string[];          // 话题标签
  platformTips: string;    // 平台适配建议
}

export interface ScriptInput {
  topic: string;
  platform?: string;
  audience?: string;
  durationSec?: number;
  references?: string[];
}

const SYSTEM = [
  "你是短视频编导。基于给定选题生成可直接开拍的口播短视频脚本:候选标题、开场钩子、分镜节拍(时间/画面/口播/字幕)、配乐建议、话题标签、平台适配建议。",
  "严格只输出 JSON,不要任何额外文字。脚本要具体可执行,贴合给定平台和受众。",
  '输出格式: {"titles":["<标题>"],"hook":"<开场钩子>","beats":[{"time":"0-3s","shot":"<画面>","voiceover":"<口播>","caption":"<字幕>"}],"bgm":"<配乐建议>","tags":["<标签>"],"platformTips":"<平台适配建议>"}'
].join("\n");

function buildPrompt(input: ScriptInput): string {
  const lines = [
    `选题: ${input.topic}`,
    `目标平台: ${input.platform ?? "douyin"}`,
    `目标受众: ${input.audience ?? "泛流量用户"}`,
    `目标时长: ${input.durationSec ?? 45} 秒`
  ];
  if (input.references && input.references.length > 0) {
    lines.push(`参考爆款(只借鉴方法,不照搬): ${input.references.join("; ")}`);
  }
  return lines.join("\n");
}

export function parseScript(raw: string): ScriptDraft {
  let text = raw.trim();
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) {
    text = fence[1].trim();
  }
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1) {
    throw new Error("LLM 响应中找不到 JSON");
  }
  const parsed = JSON.parse(text.slice(start, end + 1)) as Partial<ScriptDraft>;
  return {
    titles: Array.isArray(parsed.titles) ? parsed.titles : [],
    hook: typeof parsed.hook === "string" ? parsed.hook : "",
    beats: Array.isArray(parsed.beats) ? parsed.beats : [],
    bgm: typeof parsed.bgm === "string" ? parsed.bgm : "",
    tags: Array.isArray(parsed.tags) ? parsed.tags : [],
    platformTips: typeof parsed.platformTips === "string" ? parsed.platformTips : ""
  };
}

export async function generateScript(input: ScriptInput, client: LLMClient): Promise<ScriptDraft> {
  const raw = await client.complete({ system: SYSTEM, prompt: buildPrompt(input) });
  return parseScript(raw);
}
