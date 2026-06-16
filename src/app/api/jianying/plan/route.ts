import fs from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { validationErrorResponse } from "@/lib/api";
import { defaultDraftPath, resolveLocalPath } from "@/lib/paths";
import { jianyingPlanSchema } from "@/lib/schemas";
import { completeTask, createTask, failTask, updateTask } from "@/lib/tasks";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const parsed = jianyingPlanSchema.safeParse(await request.json());
  if (!parsed.success) {
    return validationErrorResponse(parsed.error);
  }

  const payload = parsed.data;
  const task = createTask("jianying-plan", `Draft plan ${payload.title}`);
  const outputPath = resolveLocalPath(payload.outputPath ?? defaultDraftPath(`${payload.title}-${Date.now()}.json`));

  try {
    updateTask(task.id, { status: "processing", progress: 20 });
    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    const draftPlan = {
      schema: "ai-video-assistant.jianying-plan.v1",
      title: payload.title,
      aspectRatio: payload.aspectRatio,
      createdAt: new Date().toISOString(),
      mcpToolMapping: {
        createDraft: "create_draft",
        createTrack: "create_track",
        addVideoSegment: "add_video_segment",
        addAudioSegment: "add_audio_segment",
        addTextSegment: "add_text_segment",
        exportDraft: "export_draft"
      },
      segments: payload.segments.map((segment, index) => ({
        id: `segment-${String(index + 1).padStart(3, "0")}`,
        ...segment,
        suggestedTool: segment.type === "video"
          ? "add_video_segment"
          : segment.type === "audio"
            ? "add_audio_segment"
            : "add_text_segment"
      }))
    };

    await fs.writeFile(outputPath, JSON.stringify(draftPlan, null, 2), "utf8");
    return NextResponse.json({ task: completeTask(task.id, { outputPath, draftPlan }) });
  } catch (error) {
    return NextResponse.json({ task: failTask(task.id, error) }, { status: 500 });
  }
}
