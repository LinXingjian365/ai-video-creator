import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { clipVideo, mergeVideos } from "@/lib/ffmpeg";
import { defaultDraftPath, defaultOutputPath, resolveLocalPath } from "@/lib/paths";
import { automaticClipSchema, automaticRenderSchema } from "@/lib/schemas";

type AutomaticClip = z.infer<typeof automaticClipSchema>;
type AutomaticRenderInput = z.infer<typeof automaticRenderSchema>;

const videoExtensions = new Set([".mp4", ".mov", ".mkv", ".webm", ".avi", ".flv", ".wmv", ".3gp"]);

export interface AutoRenderCallbacks {
  onProgress?: (progress: number) => void;
  onLog?: (message: string) => void;
}

export async function renderAutomaticCut(input: AutomaticRenderInput, callbacks: AutoRenderCallbacks = {}) {
  const plan = input.planPath ? await readJson(resolveLocalPath(input.planPath)) : null;
  const clips = await resolveClips(input, plan);
  const outputPath = resolveLocalPath(input.outputPath ?? defaultOutputPath(`${slug(input.projectTitle)}-${Date.now()}-rough-cut.mp4`));
  const tempDir = defaultOutputPath(`tmp-${slug(input.projectTitle)}-${Date.now()}`);
  await fs.mkdir(tempDir, { recursive: true });

  callbacks.onLog?.(`Resolved ${clips.length} clip(s) for automatic render.`);
  callbacks.onProgress?.(8);

  const renderedSegments: string[] = [];
  for (const [index, clip] of clips.entries()) {
    const extension = path.extname(clip.inputPath) || ".mp4";
    const segmentPath = path.join(tempDir, `segment-${String(index + 1).padStart(3, "0")}${extension}`);
    callbacks.onLog?.(`Clipping ${clip.label ?? `segment ${index + 1}`}: ${clip.inputPath} ${clip.startMs}-${clip.endMs}ms`);
    await clipVideo({
      inputPath: resolveLocalPath(clip.inputPath),
      outputPath: segmentPath,
      startMs: clip.startMs,
      endMs: clip.endMs,
      quality: "fast",
      videoCodec: "libx264",
      audioCodec: "aac",
      onProgress: (progress) => {
        const total = 8 + Math.round(((index + progress / 100) / clips.length) * 72);
        callbacks.onProgress?.(Math.min(80, total));
      },
      onLog: callbacks.onLog
    });
    renderedSegments.push(segmentPath);
  }

  if (renderedSegments.length === 1) {
    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    await fs.copyFile(renderedSegments[0], outputPath);
  } else {
    callbacks.onLog?.(`Merging ${renderedSegments.length} rendered segment(s).`);
    await mergeVideos({
      inputPaths: renderedSegments,
      outputPath,
      quality: "fast",
      videoCodec: "libx264",
      audioCodec: "aac",
      onProgress: (progress) => callbacks.onProgress?.(80 + Math.round(progress * 0.18)),
      onLog: callbacks.onLog
    });
  }

  const draftPlanPath = resolveLocalPath(input.draftPlanOutputPath ?? defaultDraftPath(`${slug(input.projectTitle)}-${Date.now()}-jianying-plan.json`));
  const draftPlan = createJianyingDraftPlan(input.projectTitle, clips, outputPath);
  await fs.mkdir(path.dirname(draftPlanPath), { recursive: true });
  await fs.writeFile(draftPlanPath, JSON.stringify(draftPlan, null, 2), "utf8");
  callbacks.onProgress?.(100);

  return {
    outputPath,
    draftPlanPath,
    clips,
    draftPlan
  };
}

async function resolveClips(input: AutomaticRenderInput, plan: unknown): Promise<AutomaticClip[]> {
  if (input.clips?.length) {
    return input.clips;
  }

  const firstInput = input.inputPath ?? await findFirstVideo(input.materialDir);
  const sceneDurations = extractSceneDurations(plan);
  let cursor = 0;

  return sceneDurations.map((durationMs, index) => {
    const startMs = cursor;
    const endMs = cursor + durationMs;
    cursor = endMs;
    return {
      inputPath: firstInput,
      startMs,
      endMs,
      label: `auto-scene-${String(index + 1).padStart(2, "0")}`
    };
  });
}

async function findFirstVideo(materialDir: string) {
  const dir = resolveLocalPath(materialDir);
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const file = entries
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .find((name) => videoExtensions.has(path.extname(name).toLowerCase()));

  if (!file) {
    throw new Error(`No video file found in ${dir}. Provide inputPath or clips.`);
  }

  return path.join(dir, file);
}

function extractSceneDurations(plan: unknown) {
  if (isPlan(plan) && plan.scenes.length > 0) {
    return plan.scenes.slice(0, 6).map((scene) => Number(scene.targetDurationMs ?? 3000)).filter((duration) => duration > 0);
  }

  return [2500, 2500, 2500];
}

function isPlan(value: unknown): value is { scenes: Array<{ targetDurationMs?: number | null }> } {
  return Boolean(value && typeof value === "object" && Array.isArray((value as { scenes?: unknown }).scenes));
}

async function readJson(filePath: string) {
  return JSON.parse(await fs.readFile(filePath, "utf8")) as unknown;
}

function createJianyingDraftPlan(title: string, clips: AutomaticClip[], outputPath: string) {
  let cursor = 0;
  return {
    schema: "ai-video-assistant.jianying-plan.v1",
    title,
    createdAt: new Date().toISOString(),
    roughCutOutputPath: outputPath,
    mcpToolMapping: {
      createDraft: "create_draft",
      createTrack: "create_track",
      addVideoSegment: "add_video_segment",
      addTextSegment: "add_text_segment",
      exportDraft: "export_draft"
    },
    segments: clips.flatMap((clip, index) => {
      const durationMs = clip.endMs - clip.startMs;
      const startMs = cursor;
      cursor += durationMs;
      return [
        {
          id: `video-${String(index + 1).padStart(3, "0")}`,
          type: "video",
          source: resolveLocalPath(clip.inputPath),
          sourceInMs: clip.startMs,
          sourceOutMs: clip.endMs,
          startMs,
          durationMs,
          track: "main",
          suggestedTool: "add_video_segment"
        },
        {
          id: `caption-${String(index + 1).padStart(3, "0")}`,
          type: "text",
          text: clip.label ?? `片段 ${index + 1}`,
          startMs,
          durationMs: Math.min(1800, durationMs),
          track: "subtitle",
          suggestedTool: "add_text_segment"
        }
      ];
    })
  };
}

function slug(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/gi, "-")
    .replace(/^-+|-+$/g, "") || "auto-render";
}
