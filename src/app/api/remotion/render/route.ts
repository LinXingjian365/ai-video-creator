import { NextResponse } from "next/server";
import { validationErrorResponse } from "@/lib/api";
import { renderScriptPackage } from "@/lib/remotion-render";
import { remotionRenderSchema } from "@/lib/schemas";
import { appendTaskLog, completeTask, createTask, failTask, updateTask } from "@/lib/tasks";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const parsed = remotionRenderSchema.safeParse(await request.json());
  if (!parsed.success) {
    return validationErrorResponse(parsed.error);
  }

  const task = createTask("remotion-render", `Remotion render ${parsed.data.title.slice(0, 24)}`);
  void runRender(task.id, parsed.data);

  return NextResponse.json({ task });
}

async function runRender(taskId: string, payload: ReturnType<typeof remotionRenderSchema.parse>) {
  try {
    updateTask(taskId, { status: "processing", progress: 10 });
    appendTaskLog(taskId, "Bundling Remotion composition.");
    const result = await renderScriptPackage(payload);
    updateTask(taskId, { progress: 95 });
    appendTaskLog(taskId, `Rendered Remotion video to ${result.outputPath}${result.bgmPath ? " with BGM mix" : ""}`);
    return completeTask(taskId, result);
  } catch (error) {
    return failTask(taskId, error);
  }
}
