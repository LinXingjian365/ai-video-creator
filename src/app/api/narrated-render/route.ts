import { NextResponse } from "next/server";
import { validationErrorResponse } from "@/lib/api";
import { renderNarratedPackage } from "@/lib/narrated-render";
import { narratedRenderSchema } from "@/lib/schemas";
import type { ScriptBeat } from "@/lib/script/generate";
import { appendTaskLog, completeTask, createTask, failTask, updateTask } from "@/lib/tasks";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const parsed = narratedRenderSchema.safeParse(await request.json());
  if (!parsed.success) {
    return validationErrorResponse(parsed.error);
  }

  const task = createTask("narrated-render", `AI 配音成片 ${parsed.data.title.slice(0, 24)}`);
  void runRender(task.id, parsed.data);

  return NextResponse.json({ task });
}

async function runRender(taskId: string, payload: ReturnType<typeof narratedRenderSchema.parse>) {
  try {
    updateTask(taskId, { status: "processing", progress: 10 });
    appendTaskLog(taskId, "合成 AI 配音并渲染成片。");
    const beats: ScriptBeat[] = payload.beats.map((beat) => ({
      time: beat.time ?? "",
      shot: beat.shot ?? "",
      voiceover: beat.voiceover ?? "",
      caption: beat.caption ?? ""
    }));
    const result = await renderNarratedPackage({
      title: payload.title,
      hook: payload.hook ?? "",
      beats,
      tags: payload.tags,
      bgm: payload.bgm,
      platform: payload.platform,
      aspectRatio: payload.aspectRatio,
      ttsProvider: payload.ttsProvider,
      voice: payload.voice,
      outputPath: payload.outputPath
    });
    updateTask(taskId, { progress: 95 });
    appendTaskLog(
      taskId,
      `配音成片完成:${result.videoPath}(${result.provider}/${result.voice}, ${result.durationSec.toFixed(1)}s, 字幕 ${result.subtitleCount} 条)`
    );
    return completeTask(taskId, result);
  } catch (error) {
    return failTask(taskId, error);
  }
}
