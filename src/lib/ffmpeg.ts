import fs from "node:fs/promises";
import path from "node:path";
import ffmpegInstaller from "@ffmpeg-installer/ffmpeg";
import ffprobeInstaller from "@ffprobe-installer/ffprobe";
import ffmpeg from "fluent-ffmpeg";

ffmpeg.setFfmpegPath(ffmpegInstaller.path);
ffmpeg.setFfprobePath(ffprobeInstaller.path);

export interface VideoInfo {
  duration: number;
  width: number;
  height: number;
  fps: number;
  bitrate: number;
  format: string;
  codec: string;
  size: number;
}

function ensureParent(filePath: string) {
  return fs.mkdir(path.dirname(filePath), { recursive: true });
}

function parseFps(rate?: string) {
  if (!rate || rate === "0/0") {
    return 0;
  }
  const [top, bottom] = rate.split("/").map(Number);
  if (!bottom) {
    return top || 0;
  }
  return Math.round((top / bottom) * 100) / 100;
}

export async function getVideoInfo(inputPath: string): Promise<VideoInfo> {
  const stats = await fs.stat(inputPath);

  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(inputPath, (error, metadata) => {
      if (error) {
        reject(error);
        return;
      }

      const video = metadata.streams.find((stream) => stream.codec_type === "video");
      resolve({
        duration: Number(metadata.format.duration ?? 0),
        width: Number(video?.width ?? 0),
        height: Number(video?.height ?? 0),
        fps: parseFps(video?.avg_frame_rate),
        bitrate: Number(metadata.format.bit_rate ?? 0),
        format: metadata.format.format_name ?? "unknown",
        codec: video?.codec_name ?? "unknown",
        size: stats.size
      });
    });
  });
}

export interface ClipOptions {
  inputPath: string;
  outputPath: string;
  startMs: number;
  endMs: number;
  quality?: string;
  videoCodec?: string;
  audioCodec?: string;
  onProgress?: (progress: number) => void;
  onLog?: (message: string) => void;
}

export async function clipVideo(options: ClipOptions) {
  await ensureParent(options.outputPath);
  const startSeconds = options.startMs / 1000;
  const durationSeconds = (options.endMs - options.startMs) / 1000;

  return new Promise<string>((resolve, reject) => {
    const command = ffmpeg(options.inputPath)
      .setStartTime(startSeconds)
      .duration(durationSeconds)
      .output(options.outputPath);

    if (options.videoCodec) command.videoCodec(options.videoCodec);
    if (options.audioCodec) command.audioCodec(options.audioCodec);
    if (options.quality) command.outputOptions(["-preset", options.quality]);

    command
      .on("start", (line) => options.onLog?.(line))
      .on("progress", (progress) => options.onProgress?.(Math.min(99, Math.round(progress.percent ?? 0))))
      .on("error", reject)
      .on("end", () => resolve(options.outputPath))
      .run();
  });
}

export interface TestVideoOptions {
  outputPath: string;
  durationSeconds: number;
  label?: string;
  frequency?: number;
  color?: string;
}

export async function createTestVideo(options: TestVideoOptions) {
  await ensureParent(options.outputPath);

  return new Promise<string>((resolve, reject) => {
    const command = ffmpeg()
      .input(`testsrc=duration=${options.durationSeconds}:size=1280x720:rate=30`)
      .inputFormat("lavfi")
      .input(`sine=frequency=${options.frequency ?? 880}:duration=${options.durationSeconds}`)
      .inputFormat("lavfi")
      .videoCodec("libx264")
      .audioCodec("aac")
      .outputOptions([
        "-shortest",
        "-pix_fmt", "yuv420p",
        "-metadata", `title=${options.label ?? "AI video assistant test clip"}`
      ])
      .output(options.outputPath);

    command
      .on("error", reject)
      .on("end", () => resolve(options.outputPath))
      .run();
  });
}

export interface MergeOptions {
  inputPaths: string[];
  outputPath: string;
  quality?: string;
  videoCodec?: string;
  audioCodec?: string;
  width?: number;
  height?: number;
  fps?: number;
  onProgress?: (progress: number) => void;
  onLog?: (message: string) => void;
}

export async function mergeVideos(options: MergeOptions) {
  await ensureParent(options.outputPath);

  return new Promise<string>((resolve, reject) => {
    const command = ffmpeg();
    options.inputPaths.forEach((input) => command.input(input));

    if (options.videoCodec) command.videoCodec(options.videoCodec);
    if (options.audioCodec) command.audioCodec(options.audioCodec);
    if (options.quality) command.outputOptions(["-preset", options.quality]);
    if (options.width && options.height) command.size(`${options.width}x${options.height}`);
    if (options.fps) command.fps(options.fps);

    command
      .mergeToFile(options.outputPath, path.dirname(options.outputPath))
      .on("start", (line) => options.onLog?.(line))
      .on("progress", (progress) => options.onProgress?.(Math.min(99, Math.round(progress.percent ?? 0))))
      .on("error", reject)
      .on("end", () => resolve(options.outputPath));
  });
}

export interface SplitOptions {
  inputPath: string;
  outputDir: string;
  splitBy: "duration" | "size" | "segments";
  durationSeconds?: number;
  maxSize?: number;
  segmentCount?: number;
  namePattern?: string;
  onProgress?: (progress: number) => void;
  onLog?: (message: string) => void;
}

export async function splitVideo(options: SplitOptions) {
  await fs.mkdir(options.outputDir, { recursive: true });
  const info = await getVideoInfo(options.inputPath);
  const estimatedSegmentsBySize = options.maxSize
    ? Math.max(1, Math.ceil(info.size / (options.maxSize * 1024 * 1024)))
    : 1;
  const segmentDuration = options.splitBy === "duration"
    ? Number(options.durationSeconds)
    : Math.ceil(info.duration / (options.splitBy === "size" ? estimatedSegmentsBySize : Number(options.segmentCount)));
  const count = Math.max(1, Math.ceil(info.duration / segmentDuration));
  const extension = path.extname(options.inputPath) || ".mp4";
  const basePattern = options.namePattern ?? "segment_{index}{ext}";
  const outputs: string[] = [];

  for (let index = 0; index < count; index += 1) {
    const fileName = basePattern
      .replace("{index}", String(index + 1).padStart(3, "0"))
      .replace("{ext}", extension);
    const outputPath = path.join(options.outputDir, fileName);
    outputs.push(outputPath);
    const startMs = Math.round(index * segmentDuration * 1000);
    const endMs = Math.round(Math.min(info.duration, (index + 1) * segmentDuration) * 1000);

    options.onLog?.(`Rendering segment ${index + 1}/${count}: ${outputPath}`);
    await clipVideo({
      inputPath: options.inputPath,
      outputPath,
      startMs,
      endMs,
      videoCodec: "libx264",
      audioCodec: "aac",
      quality: "fast",
      onProgress: (progress) => {
        const total = Math.round(((index + progress / 100) / count) * 100);
        options.onProgress?.(Math.min(99, total));
      }
    });
  }

  return outputs;
}
