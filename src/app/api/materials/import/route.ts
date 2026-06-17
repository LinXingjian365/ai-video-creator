import { NextResponse } from "next/server";
import { validationErrorResponse } from "@/lib/api";
import { importWithYtDlp } from "@/lib/materials/yt-dlp";
import { materialImportSchema } from "@/lib/schemas";
import { appendTaskLog, completeTask, createTask, failTask, updateTask } from "@/lib/tasks";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const parsed = materialImportSchema.safeParse(await request.json());
  if (!parsed.success) {
    return validationErrorResponse(parsed.error);
  }

  const payload = parsed.data;
  const task = createTask("material-import", `Import reference material ${payload.url}`);
  const finalTask = await runImport(task.id, payload);

  return NextResponse.json(
    { task: finalTask },
    { status: finalTask.status === "failed" ? 500 : 200 }
  );
}

async function runImport(taskId: string, payload: ReturnType<typeof materialImportSchema.parse>) {
  try {
    updateTask(taskId, { status: "processing", progress: 1 });
    const manifest = await importWithYtDlp(payload, {
      onLog: (message) => appendTaskLog(taskId, message),
      onProgress: (progress) => updateTask(taskId, { progress })
    });
    return completeTask(taskId, manifest);
  } catch (error) {
    return failTask(taskId, error);
  }
}
