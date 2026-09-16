import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import ffmpegInstaller from "@ffmpeg-installer/ffmpeg";
import { getVideoInfo, type VideoInfo } from "@/lib/ffmpeg";
import { defaultDraftPath, resolveLocalPath } from "@/lib/paths";
import { getVideoToolsPython } from "@/lib/python-tools";
import type { MaterialImportManifest } from "./yt-dlp";

export interface TranscriptSegment {
  index: number;
  startMs: number;
  endMs: number;
  text: string;
}

export interface SceneChange {
  index: number;
  timeMs: number;
  confidence: number;
  source: "ffmpeg-scene" | "pyscenedetect";
}

export interface SilenceRange {
  index: number;
  startMs: number;
  endMs: number;
  durationMs: number;
  source: "ffmpeg-silence";
}

export interface SpeechRange {
  index: number;
  startMs: number;
  endMs: number;
  durationMs: number;
  source: "ffmpeg-speech";
}

export interface CandidateClip {
  id: string;
  startMs: number;
  endMs: number;
  reason: string;
  source: "subtitle" | "speech" | "scene" | "fallback";
}

export interface AutoEditorPreview {
  source: "auto-editor-preview" | "none";
  enabled: boolean;
  inputDurationMs?: number;
  outputDurationMs?: number;
  cutCount?: number;
  clipCount?: number;
  raw?: string;
  error?: string;
}

export interface MaterialAnalysis {
  schema: "ai-video-assistant.material-analysis.v1";
  createdAt: string;
  source: {
    manifestPath?: string;
    materialDir?: string;
    videoPath?: string;
    subtitlePaths: string[];
  };
  media: {
    video?: VideoInfo;
    primaryVideoPath?: string;
  };
  transcript: {
    source: "subtitle-file" | "faster-whisper" | "none";
    segmentCount: number;
    segments: TranscriptSegment[];
  };
  scenes: {
    source: "ffmpeg-scene" | "pyscenedetect" | "none";
    threshold: number;
    sceneCount: number;
    changes: SceneChange[];
  };
  autoEditor: AutoEditorPreview;
  audio: {
    source: "ffmpeg-silence" | "none";
    silenceNoiseDb: number;
    silenceMinDurationSec: number;
    silenceCount: number;
    silences: SilenceRange[];
    speechRangeCount: number;
    speechRanges: SpeechRange[];
  };
  candidates: CandidateClip[];
  outputPath: string;
  notes: string[];
}

export interface MaterialAnalysisOptions {
  manifestPath?: string;
  materialDir?: string;
  videoPath?: string;
  outputPath?: string;
  sceneThreshold: number;
  maxScenes: number;
  silenceNoiseDb: number;
  silenceMinDurationSec: number;
  minClipMs: number;
  targetClipMs: number;
  transcriptionMode?: "subtitle-only" | "auto" | "faster-whisper";
  whisperModel?: string;
  whisperLanguage?: string;
  sceneBackend?: "auto" | "ffmpeg" | "pyscenedetect";
  autoEditorEnabled?: boolean;
  timeoutMs?: number;
}

export async function analyzeMaterial(options: MaterialAnalysisOptions): Promise<MaterialAnalysis> {
  const manifestPath = options.manifestPath
    ? resolveLocalPath(options.manifestPath)
    : options.materialDir
      ? await findNewestManifest(resolveLocalPath(options.materialDir))
      : undefined;
  const manifest = manifestPath ? await readManifest(manifestPath) : undefined;
  const materialDir = options.materialDir
    ? resolveLocalPath(options.materialDir)
    : manifest?.outputDir;
  const videoPath = await resolvePrimaryVideo(options.videoPath, manifest, materialDir);
  const subtitlePaths = await resolveSubtitlePaths(manifest, materialDir);

  const video = videoPath ? await getVideoInfo(videoPath) : undefined;
  const transcriptNotes: string[] = [];
  let transcriptSegments = await loadTranscriptSegments(subtitlePaths);
  let transcriptSource: MaterialAnalysis["transcript"]["source"] = transcriptSegments.length > 0 ? "subtitle-file" : "none";
  if (videoPath && transcriptSegments.length === 0 && shouldRunFasterWhisper(options.transcriptionMode)) {
    try {
      transcriptSegments = await transcribeWithFasterWhisper(videoPath, {
        model: options.whisperModel ?? "tiny",
        language: options.whisperLanguage,
        timeoutMs: options.timeoutMs ?? 600000
      });
      transcriptSource = transcriptSegments.length > 0 ? "faster-whisper" : "none";
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (options.transcriptionMode === "faster-whisper") {
        throw error;
      }
      transcriptNotes.push(`faster-whisper auto transcription failed and analysis continued without ASR: ${message}`);
    }
  }
  const sceneNotes: string[] = [];
  const scenes = videoPath
    ? await detectScenes(videoPath, {
      threshold: options.sceneThreshold,
      maxScenes: options.maxScenes,
      backend: options.sceneBackend ?? "auto",
      timeoutMs: options.timeoutMs
    })
    : [];
  if (videoPath && scenes.length === 0) {
    sceneNotes.push("No scene cuts were detected by the selected scene backend for this material.");
  }
  const durationMs = Math.round((video?.duration ?? 0) * 1000);
  const silences = videoPath
    ? await detectSilencesWithFfmpeg(videoPath, {
      noiseDb: options.silenceNoiseDb,
      minDurationSec: options.silenceMinDurationSec,
      timeoutMs: options.timeoutMs
    })
    : [];
  const speechRanges = buildSpeechRanges({
    silences,
    durationMs,
    minClipMs: options.minClipMs
  });
  const autoEditor = videoPath && options.autoEditorEnabled !== false
    ? await previewAutoEditor(videoPath, options.timeoutMs ?? 120000)
    : { source: "none", enabled: false } satisfies AutoEditorPreview;
  const candidates = buildCandidateClips({
    transcriptSegments,
    speechRanges,
    scenes,
    durationMs,
    minClipMs: options.minClipMs,
    targetClipMs: options.targetClipMs
  });
  const outputPath = resolveLocalPath(options.outputPath ?? defaultDraftPath(`material-analysis-${Date.now()}.json`));

  const analysis: MaterialAnalysis = {
    schema: "ai-video-assistant.material-analysis.v1",
    createdAt: new Date().toISOString(),
    source: {
      manifestPath,
      materialDir,
      videoPath,
      subtitlePaths
    },
    media: {
      video,
      primaryVideoPath: videoPath
    },
    transcript: {
      source: transcriptSource,
      segmentCount: transcriptSegments.length,
      segments: transcriptSegments
    },
    scenes: {
      source: scenes[0]?.source ?? "none",
      threshold: options.sceneThreshold,
      sceneCount: scenes.length,
      changes: scenes
    },
    autoEditor,
    audio: {
      source: silences.length > 0 || speechRanges.length > 0 ? "ffmpeg-silence" : "none",
      silenceNoiseDb: options.silenceNoiseDb,
      silenceMinDurationSec: options.silenceMinDurationSec,
      silenceCount: silences.length,
      silences,
      speechRangeCount: speechRanges.length,
      speechRanges
    },
    candidates,
    outputPath,
    notes: [
      "Transcript uses yt-dlp subtitle files first. When transcriptionMode is auto or faster-whisper and no subtitle exists, the py312 faster-whisper backend can generate local ASR segments.",
      "Scene changes use PySceneDetect when sceneBackend is auto/pyscenedetect and fall back to FFmpeg scene detection when needed.",
      "Speech ranges use FFmpeg silencedetect; Auto-Editor preview adds a second opinion for jump-cut potential without modifying media.",
      "Candidate clips are suggestions for review, not final editorial decisions.",
      ...transcriptNotes,
      ...sceneNotes
    ]
  };

  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, JSON.stringify(analysis, null, 2), "utf8");
  return analysis;
}

function shouldRunFasterWhisper(mode: MaterialAnalysisOptions["transcriptionMode"]) {
  return mode === "auto" || mode === "faster-whisper";
}

async function readManifest(manifestPath: string): Promise<MaterialImportManifest> {
  const raw = await fs.readFile(manifestPath, "utf8");
  return JSON.parse(raw) as MaterialImportManifest;
}

async function findNewestManifest(rootDir: string): Promise<string | undefined> {
  const manifests: Array<{ path: string; mtimeMs: number }> = [];

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
      } else if (entry.isFile() && entry.name === "manifest.json") {
        const stat = await fs.stat(fullPath);
        manifests.push({ path: fullPath, mtimeMs: stat.mtimeMs });
      }
    }
  }

  await walk(rootDir);
  return manifests.sort((a, b) => b.mtimeMs - a.mtimeMs)[0]?.path;
}

async function resolvePrimaryVideo(
  videoPath: string | undefined,
  manifest: MaterialImportManifest | undefined,
  materialDir: string | undefined
): Promise<string | undefined> {
  if (videoPath) {
    return resolveLocalPath(videoPath);
  }

  const video = manifest?.files.find((file) => file.type === "video");
  if (video?.path) {
    return video.path;
  }

  return materialDir ? findNewestFile(materialDir, isVideoFile) : undefined;
}

async function resolveSubtitlePaths(manifest: MaterialImportManifest | undefined, materialDir: string | undefined): Promise<string[]> {
  const fromManifest = manifest?.files
    .filter((file) => file.type === "subtitle")
    .map((file) => file.path) ?? [];

  if (fromManifest.length > 0 || !materialDir) {
    return fromManifest;
  }

  return findFiles(materialDir, isSubtitleFile);
}

export async function loadTranscriptSegments(subtitlePaths: string[]): Promise<TranscriptSegment[]> {
  for (const subtitlePath of subtitlePaths) {
    try {
      const raw = await fs.readFile(subtitlePath, "utf8");
      const parsed = parseSubtitle(raw);
      if (parsed.length > 0) {
        return parsed;
      }
    } catch {
      // Try the next subtitle file.
    }
  }

  return [];
}

export function parseSubtitle(raw: string): TranscriptSegment[] {
  const normalized = raw.replace(/^\uFEFF/, "").replace(/\r/g, "");
  const blocks = normalized
    .replace(/^WEBVTT[^\n]*\n+/i, "")
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean);

  const segments: TranscriptSegment[] = [];
  for (const block of blocks) {
    const lines = block.split("\n").map((line) => line.trim()).filter(Boolean);
    const timeIndex = lines.findIndex((line) => line.includes("-->"));
    if (timeIndex === -1) {
      continue;
    }

    const [startRaw, endRaw] = lines[timeIndex].split("-->").map((value) => value.trim().split(/\s+/)[0]);
    const startMs = parseSubtitleTimestamp(startRaw);
    const endMs = parseSubtitleTimestamp(endRaw);
    const text = lines.slice(timeIndex + 1)
      .join(" ")
      .replace(/<[^>]+>/g, "")
      .replace(/\s+/g, " ")
      .trim();

    if (Number.isFinite(startMs) && Number.isFinite(endMs) && endMs > startMs && text) {
      segments.push({
        index: segments.length + 1,
        startMs,
        endMs,
        text
      });
    }
  }

  return segments;
}

export function parseFasterWhisperSegments(raw: string): TranscriptSegment[] {
  const parsed = JSON.parse(raw) as Array<Partial<TranscriptSegment>>;
  return parsed
    .map((segment, index) => ({
      index: Number(segment.index ?? index + 1),
      startMs: Number(segment.startMs ?? 0),
      endMs: Number(segment.endMs ?? 0),
      text: typeof segment.text === "string" ? segment.text.trim() : ""
    }))
    .filter((segment) => Number.isFinite(segment.startMs) && Number.isFinite(segment.endMs) && segment.endMs > segment.startMs && segment.text);
}

function parseSubtitleTimestamp(value: string): number {
  const normalized = value.replace(",", ".");
  const parts = normalized.split(":");
  const seconds = Number(parts.pop() ?? 0);
  const minutes = Number(parts.pop() ?? 0);
  const hours = Number(parts.pop() ?? 0);
  return Math.round(((hours * 3600) + (minutes * 60) + seconds) * 1000);
}

function transcribeWithFasterWhisper(
  videoPath: string,
  options: { model: string; language?: string; timeoutMs: number }
): Promise<TranscriptSegment[]> {
  return new Promise((resolve, reject) => {
    const script = [
      "import json, sys",
      "from faster_whisper import WhisperModel",
      "video_path = sys.argv[1]",
      "model_name = sys.argv[2]",
      "language = sys.argv[3] or None",
      "model = WhisperModel(model_name, device='cpu', compute_type='int8')",
      "segments, _info = model.transcribe(video_path, language=language, vad_filter=True)",
      "out = []",
      "for index, segment in enumerate(segments, start=1):",
      "    text = (segment.text or '').strip()",
      "    if text:",
      "        out.append({'index': index, 'startMs': round(segment.start * 1000), 'endMs': round(segment.end * 1000), 'text': text})",
      "print(json.dumps(out, ensure_ascii=False))"
    ].join("\n");
    let stdout = "";
    let stderr = "";
    let settled = false;
    const child = spawn(getVideoToolsPython(), ["-c", script, videoPath, options.model, options.language ?? ""], {
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
      child.kill();
      finish(() => reject(new Error(`faster-whisper timed out after ${options.timeoutMs}ms`)));
    }, options.timeoutMs);

    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("error", (error) => finish(() => reject(error)));
    child.on("close", (code) => {
      if (code !== 0) {
        finish(() => reject(new Error(`faster-whisper exited with code ${code ?? "unknown"}: ${stderr.trim()}`)));
        return;
      }
      try {
        const segments = parseFasterWhisperSegments(stdout);
        finish(() => resolve(segments));
      } catch (error) {
        finish(() => reject(error));
      }
    });
  });
}

export function buildCandidateClips(options: {
  transcriptSegments: TranscriptSegment[];
  speechRanges: SpeechRange[];
  scenes: SceneChange[];
  durationMs: number;
  minClipMs: number;
  targetClipMs: number;
}): CandidateClip[] {
  const clips: CandidateClip[] = [];
  const strongTranscript = options.transcriptSegments
    .filter((segment) => segment.text.length >= 12 || /[?!？！，。]/.test(segment.text))
    .slice(0, 8);

  for (const segment of strongTranscript) {
    clips.push({
      id: `subtitle-${segment.index}`,
      startMs: Math.max(0, segment.startMs - 500),
      endMs: Math.max(segment.endMs, Math.min(options.durationMs || segment.endMs + options.targetClipMs, segment.startMs + options.targetClipMs)),
      reason: `Subtitle cue: ${segment.text.slice(0, 80)}`,
      source: "subtitle"
    });
  }

  for (const speech of options.speechRanges.slice(0, 8)) {
    clips.push({
      id: `speech-${speech.index}`,
      startMs: speech.startMs,
      endMs: Math.min(speech.endMs, speech.startMs + options.targetClipMs),
      reason: `Non-silent speech range ${(speech.startMs / 1000).toFixed(2)}s-${(speech.endMs / 1000).toFixed(2)}s`,
      source: "speech"
    });
  }

  for (const scene of options.scenes.slice(0, 8)) {
    clips.push({
      id: `scene-${scene.index}`,
      startMs: scene.timeMs,
      endMs: Math.min(options.durationMs || scene.timeMs + options.targetClipMs, scene.timeMs + options.targetClipMs),
      reason: `FFmpeg scene change at ${(scene.timeMs / 1000).toFixed(2)}s`,
      source: "scene"
    });
  }

  if (clips.length === 0 && options.durationMs > 0) {
    const count = Math.min(3, Math.max(1, Math.floor(options.durationMs / options.targetClipMs)));
    for (let index = 0; index < count; index += 1) {
      const startMs = Math.round((options.durationMs / count) * index);
      clips.push({
        id: `fallback-${index + 1}`,
        startMs,
        endMs: Math.min(options.durationMs, startMs + options.targetClipMs),
        reason: "Fallback evenly-spaced review candidate because no subtitle or scene signal was available.",
        source: "fallback"
      });
    }
  }

  return clips
    .filter((clip) => clip.endMs - clip.startMs >= options.minClipMs)
    .slice(0, 12);
}

export function parseAutoEditorPreview(raw: string): AutoEditorPreview {
  const inputMs = parsePreviewDuration(raw, /input:\s+([0-9:.]+)/);
  const outputMs = parsePreviewDuration(raw, /output:\s+([0-9:.]+)/);
  const clipCount = parsePreviewInt(raw, /clips:\s*[\s\S]*?amount:\s+(\d+)/);
  const cutCount = parsePreviewInt(raw, /cuts:\s*[\s\S]*?amount:\s+(\d+)/);

  return {
    source: "auto-editor-preview",
    enabled: true,
    inputDurationMs: inputMs,
    outputDurationMs: outputMs,
    clipCount,
    cutCount,
    raw: raw.trim()
  };
}

function parsePreviewInt(raw: string, pattern: RegExp): number | undefined {
  const match = raw.match(pattern);
  if (!match) {
    return undefined;
  }
  const value = Number(match[1]);
  return Number.isFinite(value) ? value : undefined;
}

function parsePreviewDuration(raw: string, pattern: RegExp): number | undefined {
  const match = raw.match(pattern);
  if (!match) {
    return undefined;
  }
  return parseClockDurationMs(match[1]);
}

function parseClockDurationMs(value: string): number | undefined {
  const parts = value.split(":").map(Number);
  if (parts.some((part) => !Number.isFinite(part))) {
    return undefined;
  }
  const seconds = parts.pop() ?? 0;
  const minutes = parts.pop() ?? 0;
  const hours = parts.pop() ?? 0;
  return Math.round(((hours * 3600) + (minutes * 60) + seconds) * 1000);
}

export function parseSilenceDetectOutput(raw: string): SilenceRange[] {
  const starts = [...raw.matchAll(/silence_start:\s*([0-9.]+)/g)].map((match) => Number(match[1]));
  const ends = [...raw.matchAll(/silence_end:\s*([0-9.]+)\s*\|\s*silence_duration:\s*([0-9.]+)/g)]
    .map((match) => ({
      endSec: Number(match[1]),
      durationSec: Number(match[2])
    }));
  const ranges: SilenceRange[] = [];

  for (const [index, end] of ends.entries()) {
    const startSec = starts[index] ?? Math.max(0, end.endSec - end.durationSec);
    const startMs = Math.max(0, Math.round(startSec * 1000));
    const endMs = Math.max(startMs, Math.round(end.endSec * 1000));
    const durationMs = Math.max(0, Math.round(end.durationSec * 1000));
    if (endMs > startMs) {
      ranges.push({
        index: ranges.length + 1,
        startMs,
        endMs,
        durationMs,
        source: "ffmpeg-silence"
      });
    }
  }

  return ranges;
}

export function buildSpeechRanges(options: {
  silences: SilenceRange[];
  durationMs: number;
  minClipMs: number;
}): SpeechRange[] {
  if (options.durationMs <= 0) {
    return [];
  }

  const ranges: SpeechRange[] = [];
  let cursor = 0;
  for (const silence of [...options.silences].sort((a, b) => a.startMs - b.startMs)) {
    const endMs = Math.min(silence.startMs, options.durationMs);
    if (endMs - cursor >= options.minClipMs) {
      ranges.push({
        index: ranges.length + 1,
        startMs: cursor,
        endMs,
        durationMs: endMs - cursor,
        source: "ffmpeg-speech"
      });
    }
    cursor = Math.max(cursor, Math.min(silence.endMs, options.durationMs));
  }

  if (options.durationMs - cursor >= options.minClipMs) {
    ranges.push({
      index: ranges.length + 1,
      startMs: cursor,
      endMs: options.durationMs,
      durationMs: options.durationMs - cursor,
      source: "ffmpeg-speech"
    });
  }

  return ranges;
}

async function detectScenesWithFfmpeg(
  videoPath: string,
  options: { threshold: number; maxScenes: number; timeoutMs?: number }
): Promise<SceneChange[]> {
  const threshold = Math.max(0.05, Math.min(0.95, options.threshold));
  const args = [
    "-hide_banner",
    "-i",
    videoPath,
    "-vf",
    `select='gt(scene,${threshold})',showinfo`,
    "-vsync",
    "vfr",
    "-f",
    "null",
    "-"
  ];

  const stderr = await runFfmpeg(args, options.timeoutMs ?? 45000);
  const matches = [...stderr.matchAll(/pts_time:([0-9.]+)/g)];
  const seen = new Set<number>();
  const changes: SceneChange[] = [];

  for (const match of matches) {
    const timeMs = Math.round(Number(match[1]) * 1000);
    if (!Number.isFinite(timeMs) || seen.has(timeMs)) {
      continue;
    }
    seen.add(timeMs);
    changes.push({
      index: changes.length + 1,
      timeMs,
      confidence: Math.round(threshold * 100),
      source: "ffmpeg-scene"
    });
    if (changes.length >= options.maxScenes) {
      break;
    }
  }

  return changes;
}

async function detectScenes(
  videoPath: string,
  options: { threshold: number; maxScenes: number; backend: "auto" | "ffmpeg" | "pyscenedetect"; timeoutMs?: number }
): Promise<SceneChange[]> {
  if (options.backend === "ffmpeg") {
    return detectScenesWithFfmpeg(videoPath, options);
  }

  try {
    const scenes = await detectScenesWithPySceneDetect(videoPath, options);
    if (scenes.length > 0 || options.backend === "pyscenedetect") {
      return scenes;
    }
  } catch (error) {
    if (options.backend === "pyscenedetect") {
      throw error;
    }
  }

  return detectScenesWithFfmpeg(videoPath, options);
}

function detectScenesWithPySceneDetect(
  videoPath: string,
  options: { threshold: number; maxScenes: number; timeoutMs?: number }
): Promise<SceneChange[]> {
  return new Promise((resolve, reject) => {
    const threshold = Math.round(Math.max(0.05, Math.min(0.95, options.threshold)) * 100);
    const script = [
      "import json, sys",
      "from scenedetect import open_video, SceneManager",
      "from scenedetect.detectors import ContentDetector",
      "video_path = sys.argv[1]",
      "threshold = float(sys.argv[2])",
      "max_scenes = int(sys.argv[3])",
      "video = open_video(video_path)",
      "manager = SceneManager()",
      "manager.add_detector(ContentDetector(threshold=threshold, min_scene_len='0.6s'))",
      "manager.detect_scenes(video, show_progress=False)",
      "scene_list = manager.get_scene_list()",
      "out = []",
      "for index, scene in enumerate(scene_list[1:max_scenes + 1], start=1):",
      "    start = scene[0]",
      "    out.append({'index': index, 'timeMs': round(start.get_seconds() * 1000), 'confidence': round(threshold), 'source': 'pyscenedetect'})",
      "print(json.dumps(out, ensure_ascii=False))"
    ].join("\n");
    let stdout = "";
    let stderr = "";
    let settled = false;
    const child = spawn(getVideoToolsPython(), ["-c", script, videoPath, String(threshold), String(options.maxScenes)], {
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
      child.kill();
      finish(() => reject(new Error(`PySceneDetect timed out after ${options.timeoutMs ?? 120000}ms`)));
    }, options.timeoutMs ?? 120000);

    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("error", (error) => finish(() => reject(error)));
    child.on("close", (code) => {
      if (code !== 0) {
        finish(() => reject(new Error(`PySceneDetect exited with code ${code ?? "unknown"}: ${stderr.trim()}`)));
        return;
      }
      try {
        const scenes = JSON.parse(stdout) as SceneChange[];
        finish(() => resolve(scenes.slice(0, options.maxScenes)));
      } catch (error) {
        finish(() => reject(error));
      }
    });
  });
}

async function detectSilencesWithFfmpeg(
  videoPath: string,
  options: { noiseDb: number; minDurationSec: number; timeoutMs?: number }
): Promise<SilenceRange[]> {
  const noiseDb = Math.max(-80, Math.min(-10, options.noiseDb));
  const minDurationSec = Math.max(0.2, Math.min(10, options.minDurationSec));
  const args = [
    "-hide_banner",
    "-i",
    videoPath,
    "-af",
    `silencedetect=noise=${noiseDb}dB:d=${minDurationSec}`,
    "-f",
    "null",
    "-"
  ];

  const stderr = await runFfmpeg(args, options.timeoutMs ?? 45000);
  return parseSilenceDetectOutput(stderr);
}

function runFfmpeg(args: string[], timeoutMs: number): Promise<string> {
  return new Promise((resolve, reject) => {
    let stderr = "";
    let settled = false;
    const child = spawn(ffmpegInstaller.path, args, {
      windowsHide: true,
      stdio: ["ignore", "ignore", "pipe"]
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
      child.kill();
      finish(() => reject(new Error(`FFmpeg scene detection timed out after ${timeoutMs}ms`)));
    }, timeoutMs);

    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("error", (error) => finish(() => reject(error)));
    child.on("close", () => finish(() => resolve(stderr)));
  });
}

function previewAutoEditor(videoPath: string, timeoutMs: number): Promise<AutoEditorPreview> {
  return new Promise((resolve) => {
    let output = "";
    let settled = false;
    const child = spawn(getVideoToolsPython(), ["-m", "auto_editor", videoPath, "--preview", "--no-open", "--progress", "none"], {
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
      child.kill();
      finish(() => resolve({
        source: "none",
        enabled: true,
        error: `Auto-Editor preview timed out after ${timeoutMs}ms`
      }));
    }, timeoutMs);

    child.stdout.on("data", (chunk) => {
      output += String(chunk);
    });
    child.stderr.on("data", (chunk) => {
      output += String(chunk);
    });
    child.on("error", (error) => finish(() => resolve({
      source: "none",
      enabled: true,
      error: error.message
    })));
    child.on("close", (code) => {
      if (code !== 0) {
        finish(() => resolve({
          source: "none",
          enabled: true,
          raw: output.trim(),
          error: `Auto-Editor preview exited with code ${code ?? "unknown"}`
        }));
        return;
      }
      finish(() => resolve(parseAutoEditorPreview(output)));
    });
  });
}

async function findNewestFile(rootDir: string, predicate: (fileName: string) => boolean): Promise<string | undefined> {
  const files = await findFiles(rootDir, predicate);
  const withStats = await Promise.all(files.map(async (filePath) => ({
    path: filePath,
    mtimeMs: (await fs.stat(filePath)).mtimeMs
  })));
  return withStats.sort((a, b) => b.mtimeMs - a.mtimeMs)[0]?.path;
}

async function findFiles(rootDir: string, predicate: (fileName: string) => boolean): Promise<string[]> {
  const files: string[] = [];

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
      } else if (entry.isFile() && predicate(entry.name)) {
        files.push(fullPath);
      }
    }
  }

  await walk(rootDir);
  return files.sort((a, b) => a.localeCompare(b));
}

function isVideoFile(fileName: string): boolean {
  return [".mp4", ".mov", ".mkv", ".webm", ".avi", ".m4v"].includes(path.extname(fileName).toLowerCase());
}

function isSubtitleFile(fileName: string): boolean {
  return [".srt", ".vtt", ".ass", ".ssa", ".ttml"].includes(path.extname(fileName).toLowerCase());
}
