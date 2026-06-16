import path from "node:path";
import { NextResponse } from "next/server";
import { badRequest, validationErrorResponse } from "@/lib/api";
import { clipVideo } from "@/lib/ffmpeg";
import { assertInputFile, defaultOutputPath, ensureOutputDir, PathValidationError, resolveLocalPath } from "@/lib/paths";
import { clipVideoSchema } from "@/lib/schemas";
import { appendTaskLog, completeTask, createTask, failTask, updateTask } from "@/lib/tasks";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const parsed = clipVideoSchema.safeParse(await request.json());
  if (!parsed.success) {
    return validationErrorResponse(parsed.error);
  }

  const payload = parsed.data;

  let inputPath: string;
  let outputPath: string;
  try {
    inputPath = resolveLocalPath(payload.inputPath);
    assertInputFile(inputPath);
    const ext = path.extname(inputPath) || ".mp4";
    outputPath = resolveLocalPath(payload.outputPath ?? defaultOutputPath(`clip-${Date.now()}${ext}`));
    ensureOutputDir(outputPath);
  } catch (error) {
    if (error instanceof PathValidationError) {
      return badRequest(error.message);
    }
    throw error;
  }

  const task = createTask("clip", `Clip ${payload.inputPath}`);

  void runClip(task.id, {
    ...payload,
    inputPath,
    outputPath
  });

  return NextResponse.json({ task });
}

async function runClip(taskId: string, payload: ReturnType<typeof clipVideoSchema.parse> & { inputPath: string; outputPath: string }) {
  try {
    updateTask(taskId, { status: "processing", progress: 1 });
    const outputPath = await clipVideo({
      ...payload,
      onProgress: (progress) => updateTask(taskId, { progress }),
      onLog: (message) => appendTaskLog(taskId, message)
    });
    completeTask(taskId, { outputPath });
  } catch (error) {
    failTask(taskId, error);
  }
}
