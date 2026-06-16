import path from "node:path";
import { NextResponse } from "next/server";
import { badRequest, validationErrorResponse } from "@/lib/api";
import { splitVideo } from "@/lib/ffmpeg";
import { assertInputFile, defaultOutputPath, ensureDir, PathValidationError, resolveLocalPath } from "@/lib/paths";
import { splitVideoSchema } from "@/lib/schemas";
import { appendTaskLog, completeTask, createTask, failTask, updateTask } from "@/lib/tasks";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const parsed = splitVideoSchema.safeParse(await request.json());
  if (!parsed.success) {
    return validationErrorResponse(parsed.error);
  }

  const payload = parsed.data;

  let inputPath: string;
  let outputDir: string;
  try {
    inputPath = resolveLocalPath(payload.inputPath);
    assertInputFile(inputPath);
    const baseName = path.basename(inputPath, path.extname(inputPath));
    outputDir = resolveLocalPath(payload.outputDir ?? defaultOutputPath(`${baseName}-segments`));
    ensureDir(outputDir);
  } catch (error) {
    if (error instanceof PathValidationError) {
      return badRequest(error.message);
    }
    throw error;
  }

  const task = createTask("split", `Split ${payload.inputPath}`);

  void runSplit(task.id, {
    ...payload,
    inputPath,
    outputDir
  });

  return NextResponse.json({ task });
}

async function runSplit(taskId: string, payload: ReturnType<typeof splitVideoSchema.parse> & { inputPath: string; outputDir: string }) {
  try {
    updateTask(taskId, { status: "processing", progress: 1 });
    const outputPaths = await splitVideo({
      ...payload,
      onProgress: (progress) => updateTask(taskId, { progress }),
      onLog: (message) => appendTaskLog(taskId, message)
    });
    completeTask(taskId, { outputPaths });
  } catch (error) {
    failTask(taskId, error);
  }
}
