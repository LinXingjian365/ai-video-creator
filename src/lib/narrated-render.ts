import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import ffmpegInstaller from "@ffmpeg-installer/ffmpeg";
import { outputRoot, resolveLocalPath } from "@/lib/paths";
import { renderScriptPackage, type RemotionAspectRatio } from "@/lib/remotion-render";
import type { ScriptBeat } from "@/lib/script/generate";
import { synthesizeNarration, type TtsProvider } from "@/lib/tts/synthesize";

export interface NarratedRenderInput {
  title: string;
  hook: string;
  beats: ScriptBeat[];
  tags?: string[];
  bgm?: string;
  platform?: string;
  aspectRatio?: RemotionAspectRatio;
  ttsProvider?: TtsProvider;
  voice?: string;
  outputPath?: string;
  durationPadSec?: number;
}

export interface NarratedRenderResult {
  videoPath: string;
  silentVideoPath: string;
  narrationPath: string;
  durationSec: number;
  provider: TtsProvider;
  voice: string;
}

export interface NarratedRenderDeps {
  synthesizeNarration: typeof synthesizeNarration;
  renderScriptPackage: typeof renderScriptPackage;
  muxNarration: typeof muxNarration;
}

const defaultDeps: NarratedRenderDeps = { synthesizeNarration, renderScriptPackage, muxNarration };

export function buildNarrationSegments(input: { hook?: string; beats?: Array<{ voiceover?: string }> }): string[] {
  return [input.hook ?? "", ...(input.beats ?? []).map((beat) => beat.voiceover ?? "")]
    .map((segment) => segment.trim())
    .filter(Boolean);
}

export async function renderNarratedPackage(
  input: NarratedRenderInput,
  deps: Partial<NarratedRenderDeps> = {}
): Promise<NarratedRenderResult> {
  const { synthesizeNarration, renderScriptPackage, muxNarration } = { ...defaultDeps, ...deps };

  const segments = buildNarrationSegments(input);
  if (segments.length === 0) {
    throw new Error("没有可配音的口播文本(脚本缺少 hook/voiceover)");
  }

  const narration = await synthesizeNarration(segments, { provider: input.ttsProvider, voice: input.voice });
  const pad = input.durationPadSec ?? 0.8;

  const render = await renderScriptPackage({
    aspectRatio: input.aspectRatio ?? "9:16",
    title: input.title,
    hook: input.hook,
    beats: input.beats,
    tags: input.tags,
    bgm: input.bgm,
    platform: input.platform,
    durationSec: narration.durationSec + pad
  });

  const videoPath = input.outputPath
    ? resolveLocalPath(input.outputPath)
    : path.join(outputRoot, "remotion", `${Date.now()}-narrated.mp4`);
  await fs.mkdir(path.dirname(videoPath), { recursive: true });
  await muxNarration(render.outputPath, narration.audioPath, videoPath);

  return {
    videoPath,
    silentVideoPath: render.outputPath,
    narrationPath: narration.audioPath,
    durationSec: narration.durationSec,
    provider: narration.provider,
    voice: narration.voice
  };
}

export function muxNarration(videoPath: string, audioPath: string, outputPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const args = [
      "-hide_banner",
      "-y",
      "-i",
      videoPath,
      "-i",
      audioPath,
      "-map",
      "0:v:0",
      "-map",
      "1:a:0",
      "-c:v",
      "copy",
      "-c:a",
      "aac",
      "-b:a",
      "192k",
      "-shortest",
      "-movflags",
      "+faststart",
      outputPath
    ];
    const child = spawn(ffmpegInstaller.path, args, { windowsHide: true, stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(stderr.trim() || `FFmpeg mux failed with exit code ${code}`));
    });
  });
}
