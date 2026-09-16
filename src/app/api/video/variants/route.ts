import { NextResponse } from "next/server";
import { validationErrorResponse } from "@/lib/api";
import { renderPlatformVariants } from "@/lib/platform-variants";
import { platformVariantsSchema } from "@/lib/schemas";
import { appendTaskLog, completeTask, createTask, failTask, updateTask } from "@/lib/tasks";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const parsed = platformVariantsSchema.safeParse(await request.json());
  if (!parsed.success) {
    return validationErrorResponse(parsed.error);
  }

  const task = createTask("video-variants", `Platform variants ${parsed.data.title ?? parsed.data.inputPath}`);
  const finalTask = await runVariantRender(task.id, parsed.data);

  return NextResponse.json(
    { task: finalTask },
    { status: finalTask.status === "failed" ? 500 : 200 }
  );
}

async function runVariantRender(taskId: string, payload: ReturnType<typeof platformVariantsSchema.parse>) {
  try {
    updateTask(taskId, { status: "processing", progress: 2 });
    appendTaskLog(taskId, "Rendering platform video variants.");
    const result = await renderPlatformVariants({
      ...payload,
      onLog: (message) => appendTaskLog(taskId, message),
      onProgress: (progress) => updateTask(taskId, { progress })
    });
    appendTaskLog(taskId, `Platform variants written to ${result.outputDir}`);
    return completeTask(taskId, result);
  } catch (error) {
    return failTask(taskId, error);
  }
}
