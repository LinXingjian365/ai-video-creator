import path from "node:path";
import { NextResponse } from "next/server";
import { badRequest, validationErrorResponse } from "@/lib/api";
import { mergeVideos } from "@/lib/ffmpeg";
import { assertInputFile, defaultOutputPath, ensureOutputDir, PathValidationError, resolveLocalPath } from "@/lib/paths";
import { mergeVideosSchema } from "@/lib/schemas";
import { appendTaskLog, completeTask, createTask, failTask, updateTask } from "@/lib/tasks";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const parsed = mergeVideosSchema.safeParse(await request.json());
  if (!parsed.success) {
    return validationErrorResponse(parsed.error);
  }

  const payload = parsed.data;

  let inputPaths: string[];
  let outputPath: string;
  try {
    inputPaths = payload.inputPaths.map(resolveLocalPath);
    inputPaths.forEach(assertInputFile);
    const ext = path.extname(inputPaths[0]) || ".mp4";
    outputPath = resolveLocalPath(payload.outputPath ?? defaultOutputPath(`merged-${Date.now()}${ext}`));
    ensureOutputDir(outputPath);
  } catch (error) {
    if (error instanceof PathValidationError) {
      return badRequest(error.message);
    }
    throw error;
  }

  const task = createTask("merge", `Merge ${payload.inputPaths.length} videos`);

  void runMerge(task.id, {
    ...payload,
    inputPaths,
    outputPath
  });

  return NextResponse.json({ task });
}

async function runMerge(taskId: string, payload: ReturnType<typeof mergeVideosSchema.parse> & { inputPaths: string[]; outputPath: string }) {
  try {
    updateTask(taskId, { status: "processing", progress: 1 });
    const outputPath = await mergeVideos({
      ...payload,
      onProgress: (progress) => updateTask(taskId, { progress }),
      onLog: (message) => appendTaskLog(taskId, message)
    });
    completeTask(taskId, { outputPath });
  } catch (error) {
    failTask(taskId, error);
  }
}
