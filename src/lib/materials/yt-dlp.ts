import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { inputRoot, resolveLocalPath } from "@/lib/paths";

export type MaterialQuality = "best" | "1080p" | "720p" | "480p" | "audio" | "metadata";

export interface MaterialImportOptions {
  url: string;
  collectionName?: string;
  outputDir?: string;
  quality: MaterialQuality;
  allowPlaylist: boolean;
  writeSubtitles: boolean;
  writeAutoSubtitles: boolean;
  subtitleLanguages: string[];
  cookiesPath?: string;
  timeoutMs?: number;
}

export interface ImportedMaterialFile {
  path: string;
  type: "video" | "audio" | "metadata" | "thumbnail" | "subtitle" | "other";
  size: number;
}

export interface MaterialImportManifest {
  schema: "ai-video-assistant.material-import.v1";
  sourceUrl: string;
  importedAt: string;
  outputDir: string;
  quality: MaterialQuality;
  command: string[];
  files: ImportedMaterialFile[];
  notes: string[];
}

const QUALITY_FORMAT: Record<MaterialQuality, string | null> = {
  best: "bv*+ba/b",
  "1080p": "bv*[height<=1080]+ba/b[height<=1080]/b",
  "720p": "bv*[height<=720]+ba/b[height<=720]/b",
  "480p": "bv*[height<=480]+ba/b[height<=480]/b",
  audio: "bestaudio/best",
  metadata: null
};

export function getYtDlpInvocation(): { command: string; prefixArgs: string[]; label: string } {
  const binary = process.env.YTDLP_BINARY;
  if (binary) {
    return { command: resolveLocalPath(binary), prefixArgs: [], label: binary };
  }

  if (process.platform === "win32") {
    return { command: "python", prefixArgs: ["-m", "yt_dlp"], label: "python -m yt_dlp" };
  }

  return { command: "yt-dlp", prefixArgs: [], label: "yt-dlp" };
}

export function safeCollectionName(value: string | undefined, nowMs = Date.now()): string {
  const base = (value ?? "reference").trim()
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
  return `${base || "reference"}-${nowMs}`;
}

export function resolveMaterialOutputDir(outputDir: string | undefined, collectionName: string): string {
  const target = outputDir
    ? resolveLocalPath(outputDir)
    : path.join(inputRoot, "references", collectionName);
  const resolved = path.resolve(target);
  const root = path.resolve(inputRoot);

  if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) {
    throw new Error(`Material outputDir must stay under workspace/input: ${resolved}`);
  }

  return resolved;
}

export function buildYtDlpArgs(options: MaterialImportOptions, outputDir: string): string[] {
  const args = [
    "--no-progress",
    "--newline",
    "--socket-timeout",
    "15",
    "--retries",
    "2",
    "--fragment-retries",
    "2",
    "--windows-filenames",
    "--paths",
    outputDir,
    "--output",
    options.allowPlaylist ? "%(playlist_index|00)s-%(id)s.%(ext)s" : "%(id)s.%(ext)s",
    "--write-info-json",
    "--write-thumbnail",
    "--merge-output-format",
    "mp4"
  ];

  if (!options.allowPlaylist) {
    args.push("--no-playlist");
  }

  const format = QUALITY_FORMAT[options.quality];
  if (format) {
    args.push("-f", format);
  }

  if (options.quality === "audio") {
    args.push("--extract-audio", "--audio-format", "mp3");
  }

  if (options.quality === "metadata") {
    args.push("--skip-download");
  }

  if (options.writeSubtitles) {
    args.push("--write-subs");
  }

  if (options.writeAutoSubtitles) {
    args.push("--write-auto-subs");
  }

  if (options.writeSubtitles || options.writeAutoSubtitles) {
    args.push("--sub-langs", options.subtitleLanguages.join(","));
  }

  const cookiesPath = options.cookiesPath || process.env.YTDLP_COOKIES_PATH;
  if (cookiesPath) {
    args.push("--cookies", resolveLocalPath(cookiesPath));
  }

  args.push(options.url);
  return args;
}

export async function importWithYtDlp(
  options: MaterialImportOptions,
  hooks: {
    onLog?: (message: string) => void;
    onProgress?: (progress: number) => void;
  } = {}
): Promise<MaterialImportManifest> {
  const collection = safeCollectionName(options.collectionName);
  const outputDir = resolveMaterialOutputDir(options.outputDir, collection);
  await fs.mkdir(outputDir, { recursive: true });

  const args = buildYtDlpArgs(options, outputDir);
  const invocation = getYtDlpInvocation();
  hooks.onLog?.(`Running yt-dlp import into ${outputDir}`);
  hooks.onProgress?.(5);

  await runYtDlp(invocation, args, hooks, options.timeoutMs);
  hooks.onProgress?.(90);

  const files = await listImportedFiles(outputDir);
  const manifest: MaterialImportManifest = {
    schema: "ai-video-assistant.material-import.v1",
    sourceUrl: options.url,
    importedAt: new Date().toISOString(),
    outputDir,
    quality: options.quality,
    command: [invocation.label, ...args],
    files,
    notes: [
      "Only import videos you have permission to download or analyze.",
      "Use this folder as the input for ASR, scene detection, and automatic rough cuts."
    ]
  };

  const manifestPath = path.join(outputDir, "manifest.json");
  await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2), "utf8");
  hooks.onProgress?.(100);

  return {
    ...manifest,
    files: await listImportedFiles(outputDir)
  };
}

function runYtDlp(
  invocation: { command: string; prefixArgs: string[]; label: string },
  args: string[],
  hooks: {
    onLog?: (message: string) => void;
    onProgress?: (progress: number) => void;
  },
  timeoutMs = ytdlpTimeoutMs()
): Promise<void> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const child = spawn(invocation.command, [...invocation.prefixArgs, ...args], {
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"]
    });

    const finish = (callback: () => void) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      callback();
    };

    const timer = setTimeout(() => {
      hooks.onLog?.(`yt-dlp timed out after ${timeoutMs}ms; killing process.`);
      child.kill();
      finish(() => reject(new Error(`yt-dlp timed out after ${timeoutMs}ms`)));
    }, timeoutMs);

    child.on("error", (error) => {
      finish(() => reject(new Error(`${invocation.label} is not available. Install it with: python -m pip install -U yt-dlp, or set YTDLP_BINARY. ${error.message}`)));
    });

    const handleLine = (line: string) => {
      const clean = line.trim();
      if (!clean) {
        return;
      }
      hooks.onLog?.(clean);
      const progress = parseDownloadProgress(clean);
      if (progress !== null) {
        hooks.onProgress?.(Math.max(5, Math.min(88, progress)));
      }
    };

    child.stdout.on("data", (chunk) => String(chunk).split(/\r?\n/).forEach(handleLine));
    child.stderr.on("data", (chunk) => String(chunk).split(/\r?\n/).forEach(handleLine));
    child.on("close", (code) => {
      if (code === 0) {
        finish(resolve);
      } else {
        finish(() => reject(new Error(`yt-dlp exited with code ${code ?? "unknown"}`)));
      }
    });
  });
}

function ytdlpTimeoutMs(): number {
  const parsed = Number(process.env.YTDLP_TIMEOUT_MS ?? 120000);
  return Number.isFinite(parsed) && parsed >= 10000 ? parsed : 120000;
}

function parseDownloadProgress(line: string): number | null {
  const match = line.match(/\[download]\s+(\d+(?:\.\d+)?)%/);
  if (!match) {
    return null;
  }
  return Math.round(Number(match[1]) * 0.83 + 5);
}

async function listImportedFiles(dir: string): Promise<ImportedMaterialFile[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files: ImportedMaterialFile[] = [];

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...await listImportedFiles(fullPath));
    } else if (entry.isFile()) {
      const stat = await fs.stat(fullPath);
      files.push({
        path: fullPath,
        type: classifyFile(entry.name),
        size: stat.size
      });
    }
  }

  return files.sort((a, b) => a.path.localeCompare(b.path));
}

function classifyFile(fileName: string): ImportedMaterialFile["type"] {
  const ext = path.extname(fileName).toLowerCase();
  if ([".mp4", ".mov", ".mkv", ".webm", ".avi"].includes(ext)) {
    return "video";
  }
  if ([".mp3", ".wav", ".m4a", ".aac", ".flac", ".ogg"].includes(ext)) {
    return "audio";
  }
  if ([".json"].includes(ext)) {
    return fileName === "manifest.json" ? "metadata" : "metadata";
  }
  if ([".jpg", ".jpeg", ".png", ".webp", ".avif"].includes(ext)) {
    return "thumbnail";
  }
  if ([".srt", ".vtt", ".ass", ".ssa", ".ttml"].includes(ext)) {
    return "subtitle";
  }
  return "other";
}
