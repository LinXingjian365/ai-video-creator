import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { getVideoInfo } from "@/lib/ffmpeg";
import { outputRoot, resolveLocalPath } from "@/lib/paths";
import { getVideoToolsPython } from "@/lib/python-tools";
import { parseSrt, type SubtitleCue } from "@/lib/tts/subtitles";

export type TtsProvider = "edge" | "sapi";

export interface TtsOptions {
  provider?: TtsProvider;
  voice?: string;
  rate?: string;          // edge-tts 语速, 如 "+0%" / "-10%"
  outputPath?: string;
  timeoutMs?: number;
}

export interface NarrationResult {
  audioPath: string;
  durationSec: number;
  provider: TtsProvider;
  voice: string;
  cues?: SubtitleCue[];   // edge-tts 句级真实时间轴(SAPI 无)
}

const DEFAULT_TIMEOUT_MS = 120000;

export function buildNarrationText(segments: string[]): string {
  return segments.map((segment) => segment.trim()).filter(Boolean).join("\n");
}

export function resolveTtsConfig(
  opts: Pick<TtsOptions, "provider" | "voice">,
  env: Record<string, string | undefined>
): { provider: TtsProvider; voice: string } {
  const provider = (opts.provider ?? env.TTS_PROVIDER ?? "edge") as TtsProvider;
  const voice =
    opts.voice ??
    (provider === "edge"
      ? env.EDGE_TTS_VOICE ?? "zh-CN-XiaoxiaoNeural"
      : env.SAPI_VOICE ?? "Microsoft Huihui Desktop");
  return { provider, voice };
}

export async function synthesizeNarration(
  segments: string[],
  opts: TtsOptions = {},
  env: Record<string, string | undefined> = process.env
): Promise<NarrationResult> {
  const text = buildNarrationText(segments);
  if (!text) {
    throw new Error("配音文本为空，无法合成");
  }

  const { provider, voice } = resolveTtsConfig(opts, env);
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const ttsDir = path.join(outputRoot, "tts");
  await fs.mkdir(ttsDir, { recursive: true });

  const ext = provider === "edge" ? "mp3" : "wav";
  const audioPath = opts.outputPath
    ? resolveLocalPath(opts.outputPath)
    : path.join(ttsDir, `${Date.now()}-narration.${ext}`);
  // 中文文本走 UTF-8 文件而非 argv,避开 Windows 编码坑
  const textPath = `${audioPath}.txt`;
  await fs.writeFile(textPath, text, "utf8");

  let cues: SubtitleCue[] | undefined;
  if (provider === "edge") {
    const subtitlePath = `${audioPath}.srt`;
    await synthEdge(textPath, audioPath, subtitlePath, voice, opts.rate, timeoutMs, env);
    cues = await readSubtitleCues(subtitlePath);
  } else {
    await synthSapi(textPath, audioPath, voice, timeoutMs);
  }

  const info = await getVideoInfo(audioPath);
  return { audioPath, durationSec: info.duration, provider, voice, cues };
}

// edge-tts 把字幕写到文件后读回解析; 缺失/解析失败时返回 undefined, 上层退化为按节拍对齐
async function readSubtitleCues(subtitlePath: string): Promise<SubtitleCue[] | undefined> {
  try {
    const content = await fs.readFile(subtitlePath, "utf8");
    const cues = parseSrt(content);
    return cues.length > 0 ? cues : undefined;
  } catch {
    return undefined;
  }
}

function runProcess(command: string, args: string[], timeoutMs: number, label: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { windowsHide: true, stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill();
      reject(new Error(`${label} timed out after ${timeoutMs}ms`));
    }, timeoutMs);
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("error", (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`${label} failed (exit ${code}): ${stderr.trim().slice(0, 300)}`));
      }
    });
  });
}

async function synthEdge(
  textPath: string,
  audioPath: string,
  subtitlePath: string,
  voice: string,
  rate: string | undefined,
  timeoutMs: number,
  env: Record<string, string | undefined>
): Promise<void> {
  const args = [
    "-m",
    "edge_tts",
    "--voice",
    voice,
    "--file",
    textPath,
    "--write-media",
    audioPath,
    "--write-subtitles",
    subtitlePath
  ];
  if (rate) {
    args.push("--rate", rate);
  }
  await runProcess(getVideoToolsPython(env), args, timeoutMs, `edge-tts(${voice})`);
}

async function synthSapi(textPath: string, audioPath: string, voice: string, timeoutMs: number): Promise<void> {
  const script = [
    "$ErrorActionPreference='Stop'",
    "Add-Type -AssemblyName System.Speech",
    `$text=[IO.File]::ReadAllText('${textPath}',[Text.Encoding]::UTF8)`,
    "$s=New-Object System.Speech.Synthesis.SpeechSynthesizer",
    `try { $s.SelectVoice('${voice}') } catch {}`,
    `$s.SetOutputToWaveFile('${audioPath}')`,
    "$s.Speak($text)",
    "$s.Dispose()"
  ].join("; ");
  await runProcess("powershell.exe", ["-NoProfile", "-Command", script], timeoutMs, `SAPI(${voice})`);
}
