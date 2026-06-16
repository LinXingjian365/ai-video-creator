import { NextResponse } from "next/server";
import { validationErrorResponse } from "@/lib/api";
import { renderAutomaticCut } from "@/lib/auto-render";
import { automaticRenderSchema } from "@/lib/schemas";
import { appendTaskLog, completeTask, createTask, failTask, updateTask } from "@/lib/tasks";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const parsed = automaticRenderSchema.safeParse(await request.json());
  if (!parsed.success) {
    return validationErrorResponse(parsed.error);
  }

  const payload = parsed.data;
  const task = createTask("auto-render", `Auto render ${payload.projectTitle}`);

  void runRender(task.id, payload);

  return NextResponse.json({ task });
}

async function runRender(taskId: string, payload: ReturnType<typeof automaticRenderSchema.parse>) {
  try {
    updateTask(taskId, { status: "processing", progress: 1 });
    const result = await renderAutomaticCut(payload, {
      onProgress: (progress) => updateTask(taskId, { progress }),
      onLog: (message) => appendTaskLog(taskId, message)
    });
    completeTask(taskId, result);
  } catch (error) {
    failTask(taskId, error);
  }
}
