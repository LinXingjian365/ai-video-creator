import { NextResponse } from "next/server";
import { validationErrorResponse } from "@/lib/api";
import { analyzeMaterial } from "@/lib/materials/analysis";
import { materialAnalysisSchema } from "@/lib/schemas";
import { appendTaskLog, completeTask, createTask, failTask, updateTask } from "@/lib/tasks";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const parsed = materialAnalysisSchema.safeParse(await request.json());
  if (!parsed.success) {
    return validationErrorResponse(parsed.error);
  }

  const payload = parsed.data;
  const label = payload.manifestPath ?? payload.videoPath ?? payload.materialDir ?? "material";
  const task = createTask("material-analysis", `Analyze ${label}`);
  const finalTask = await runAnalysis(task.id, payload);

  return NextResponse.json(
    { task: finalTask },
    { status: finalTask.status === "failed" ? 500 : 200 }
  );
}

async function runAnalysis(taskId: string, payload: ReturnType<typeof materialAnalysisSchema.parse>) {
  try {
    updateTask(taskId, { status: "processing", progress: 5 });
    appendTaskLog(taskId, "Loading material manifest, media info, subtitles, and scene signals.");
    const analysis = await analyzeMaterial(payload);
    updateTask(taskId, { progress: 95 });
    appendTaskLog(taskId, `Analysis written to ${analysis.outputPath}`);
    return completeTask(taskId, analysis);
  } catch (error) {
    return failTask(taskId, error);
  }
}
