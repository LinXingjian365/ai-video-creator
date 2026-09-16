import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import ffmpegInstaller from "@ffmpeg-installer/ffmpeg";
import { assertInputFile, resolveLocalPath } from "@/lib/paths";

export interface BackgroundMusicMixInput {
  videoPath: string;
  bgmPath: string;
  outputPath: string;
  bgmVolume?: number;
}

export interface NarrationBgmMixInput extends BackgroundMusicMixInput {
  narrationPath: string;
  narrationVolume?: number;
}

export function normalizeAudioVolume(value: number | undefined, fallback: number, max = 2) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }
  return Math.min(max, Math.max(0, value));
}

export function buildBackgroundMusicArgs(input: Required<BackgroundMusicMixInput>) {
  return [
    "-hide_banner",
    "-y",
    "-i",
    input.videoPath,
    "-stream_loop",
    "-1",
    "-i",
    input.bgmPath,
    "-filter_complex",
    `[1:a:0]volume=${input.bgmVolume}[bgm]`,
    "-map",
    "0:v:0",
    "-map",
    "[bgm]",
    "-c:v",
    "copy",
    "-c:a",
    "aac",
    "-b:a",
    "192k",
    "-shortest",
    "-movflags",
    "+faststart",
    input.outputPath
  ];
}

export function buildNarrationBgmArgs(input: Required<NarrationBgmMixInput>) {
  return [
    "-hide_banner",
    "-y",
    "-i",
    input.videoPath,
    "-i",
    input.narrationPath,
    "-stream_loop",
    "-1",
    "-i",
    input.bgmPath,
    "-filter_complex",
    [
      `[1:a:0]volume=${input.narrationVolume}[voice]`,
      `[2:a:0]volume=${input.bgmVolume}[bgm]`,
      "[voice][bgm]amix=inputs=2:duration=first:dropout_transition=0[aout]"
    ].join(";"),
    "-map",
    "0:v:0",
    "-map",
    "[aout]",
    "-c:v",
    "copy",
    "-c:a",
    "aac",
    "-b:a",
    "192k",
    "-shortest",
    "-movflags",
    "+faststart",
    input.outputPath
  ];
}

export async function mixBackgroundMusic(input: BackgroundMusicMixInput): Promise<void> {
  const resolved = {
    videoPath: resolveLocalPath(input.videoPath),
    bgmPath: resolveLocalPath(input.bgmPath),
    outputPath: resolveLocalPath(input.outputPath),
    bgmVolume: normalizeAudioVolume(input.bgmVolume, 0.18, 1)
  };
  assertInputFile(resolved.videoPath);
  assertInputFile(resolved.bgmPath);
  await fs.mkdir(path.dirname(resolved.outputPath), { recursive: true });
  await runFfmpeg(buildBackgroundMusicArgs(resolved));
}

export async function mixNarrationWithBackgroundMusic(input: NarrationBgmMixInput): Promise<void> {
  const resolved = {
    videoPath: resolveLocalPath(input.videoPath),
    narrationPath: resolveLocalPath(input.narrationPath),
    bgmPath: resolveLocalPath(input.bgmPath),
    outputPath: resolveLocalPath(input.outputPath),
    bgmVolume: normalizeAudioVolume(input.bgmVolume, 0.18, 1),
    narrationVolume: normalizeAudioVolume(input.narrationVolume, 1, 2)
  };
  assertInputFile(resolved.videoPath);
  assertInputFile(resolved.narrationPath);
  assertInputFile(resolved.bgmPath);
  await fs.mkdir(path.dirname(resolved.outputPath), { recursive: true });
  await runFfmpeg(buildNarrationBgmArgs(resolved));
}

function runFfmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
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
      reject(new Error(stderr.trim() || `FFmpeg audio mix failed with exit code ${code}`));
    });
  });
}
