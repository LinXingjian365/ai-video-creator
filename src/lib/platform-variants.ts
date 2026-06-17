import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import ffmpegInstaller from "@ffmpeg-installer/ffmpeg";
import { outputRoot, resolveLocalPath } from "@/lib/paths";

export type PlatformVariantId = "douyin" | "kuaishou" | "bilibili" | "square";
export type PlatformVariantMode = "crop" | "fit";

export interface PlatformVariantTarget {
  id: PlatformVariantId;
  label: string;
  width: number;
  height: number;
  fps: number;
  mode: PlatformVariantMode;
}

export interface RenderPlatformVariantsOptions {
  inputPath: string;
  outputDir?: string;
  title?: string;
  targets?: PlatformVariantId[];
  mode?: PlatformVariantMode;
  onLog?: (message: string) => void;
  onProgress?: (progress: number) => void;
}

export interface PlatformVariantOutput extends PlatformVariantTarget {
  outputPath: string;
}

export interface PlatformVariantManifest {
  schema: "ai-video-assistant.platform-variants.v1";
  title: string;
  inputPath: string;
  outputDir: string;
  createdAt: string;
  variants: PlatformVariantOutput[];
}

const targetCatalog: Record<PlatformVariantId, Omit<PlatformVariantTarget, "mode">> = {
  douyin: { id: "douyin", label: "Douyin 9:16", width: 1080, height: 1920, fps: 30 },
  kuaishou: { id: "kuaishou", label: "Kuaishou 9:16", width: 1080, height: 1920, fps: 30 },
  bilibili: { id: "bilibili", label: "Bilibili 16:9", width: 1920, height: 1080, fps: 30 },
  square: { id: "square", label: "Square 1:1", width: 1080, height: 1080, fps: 30 }
};

export function platformVariantTargets(ids: PlatformVariantId[], mode: PlatformVariantMode): PlatformVariantTarget[] {
  const selected = ids.length > 0 ? ids : ["douyin", "kuaishou", "bilibili", "square"] satisfies PlatformVariantId[];
  return selected.map((id) => ({ ...targetCatalog[id], mode }));
}

export function buildReframeFilter(target: Pick<PlatformVariantTarget, "width" | "height" | "mode">): string {
  if (target.mode === "fit") {
    return [
      `scale=${target.width}:${target.height}:force_original_aspect_ratio=decrease`,
      `pad=${target.width}:${target.height}:(ow-iw)/2:(oh-ih)/2`,
      "setsar=1"
    ].join(",");
  }

  return [
    `scale=${target.width}:${target.height}:force_original_aspect_ratio=increase`,
    `crop=${target.width}:${target.height}`,
    "setsar=1"
  ].join(",");
}

export async function renderPlatformVariants(options: RenderPlatformVariantsOptions): Promise<PlatformVariantManifest> {
  const inputPath = await resolveVariantInputPath(options.inputPath);
  const title = options.title?.trim() || path.basename(inputPath, path.extname(inputPath));
  const outputDir = resolveOutputDir(options.outputDir, title);
  const targets = platformVariantTargets(options.targets ?? [], options.mode ?? "crop");
  await fs.mkdir(outputDir, { recursive: true });

  const variants: PlatformVariantOutput[] = [];
  for (const [index, target] of targets.entries()) {
    const outputPath = path.join(outputDir, `${slug(title)}-${target.id}-${target.width}x${target.height}.mp4`);
    options.onLog?.(`Rendering ${target.label} to ${outputPath}`);
    await runFfmpegVariant({
      inputPath,
      outputPath,
      target,
      onLog: options.onLog
    });
    variants.push({ ...target, outputPath });
    options.onProgress?.(Math.round(((index + 1) / targets.length) * 95));
  }

  const manifest: PlatformVariantManifest = {
    schema: "ai-video-assistant.platform-variants.v1",
    title,
    inputPath,
    outputDir,
    createdAt: new Date().toISOString(),
    variants
  };
  await fs.writeFile(path.join(outputDir, "platform-variants.json"), JSON.stringify(manifest, null, 2), "utf8");
  options.onProgress?.(100);
  return manifest;
}

async function resolveVariantInputPath(value: string) {
  const resolved = resolveLocalPath(value);
  const stat = await fs.stat(resolved);
  if (stat.isFile()) {
    return resolved;
  }
  if (!stat.isDirectory()) {
    throw new Error(`Platform variant inputPath must be a video file or directory: ${resolved}`);
  }

  const latest = await findNewestVideo(resolved);
  if (!latest) {
    throw new Error(`No video file found under ${resolved}`);
  }
  return latest;
}

async function findNewestVideo(rootDir: string): Promise<string | undefined> {
  const videos: Array<{ path: string; mtimeMs: number }> = [];

  async function walk(dir: string) {
    let entries: Array<import("node:fs").Dirent>;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(fullPath);
      } else if (entry.isFile() && isVideoFile(entry.name)) {
        const stat = await fs.stat(fullPath);
        videos.push({ path: fullPath, mtimeMs: stat.mtimeMs });
      }
    }
  }

  await walk(rootDir);
  return videos.sort((a, b) => b.mtimeMs - a.mtimeMs)[0]?.path;
}

function isVideoFile(fileName: string) {
  return [".mp4", ".mov", ".mkv", ".webm", ".avi", ".m4v"].includes(path.extname(fileName).toLowerCase());
}

function resolveOutputDir(value: string | undefined, title: string) {
  const fallback = path.join(outputRoot, "publish", `${slug(title)}-${Date.now()}`);
  const resolved = value ? resolveLocalPath(value) : fallback;
  const relative = path.relative(outputRoot, resolved);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`Platform variant outputDir must stay under workspace/output: ${resolved}`);
  }
  return resolved;
}

function runFfmpegVariant(options: {
  inputPath: string;
  outputPath: string;
  target: PlatformVariantTarget;
  onLog?: (message: string) => void;
}): Promise<void> {
  return new Promise((resolve, reject) => {
    const args = [
      "-hide_banner",
      "-y",
      "-i",
      options.inputPath,
      "-vf",
      buildReframeFilter(options.target),
      "-r",
      String(options.target.fps),
      "-c:v",
      "libx264",
      "-preset",
      "fast",
      "-crf",
      "20",
      "-c:a",
      "aac",
      "-b:a",
      "160k",
      "-movflags",
      "+faststart",
      options.outputPath
    ];
    options.onLog?.(`${ffmpegInstaller.path} ${args.join(" ")}`);

    const child = spawn(ffmpegInstaller.path, args, {
      windowsHide: true,
      stdio: ["ignore", "ignore", "pipe"]
    });
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
      reject(new Error(stderr.trim() || `FFmpeg variant render failed with exit code ${code}`));
    });
  });
}

function slug(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/gi, "-")
    .replace(/^-+|-+$/g, "") || "platform-variants";
}
