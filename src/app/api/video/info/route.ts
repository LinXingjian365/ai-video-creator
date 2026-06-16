import { NextResponse } from "next/server";
import { badRequest, isValidationError, validationErrorResponse } from "@/lib/api";
import { getVideoInfo } from "@/lib/ffmpeg";
import { assertInputFile, PathValidationError, resolveLocalPath } from "@/lib/paths";
import { videoInfoSchema } from "@/lib/schemas";
import { completeTask, createTask, failTask, updateTask } from "@/lib/tasks";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const parsed = videoInfoSchema.safeParse(await request.json());
  if (!parsed.success) {
    return validationErrorResponse(parsed.error);
  }

  const payload = parsed.data;

  let inputPath: string;
  try {
    inputPath = resolveLocalPath(payload.inputPath);
    assertInputFile(inputPath);
  } catch (error) {
    if (error instanceof PathValidationError) {
      return badRequest(error.message);
    }
    throw error;
  }

  const task = createTask("info", `Inspect ${payload.inputPath}`);

  try {
    updateTask(task.id, { status: "processing", progress: 30 });
    const info = await getVideoInfo(inputPath);
    return NextResponse.json({ task: completeTask(task.id, info) });
  } catch (error) {
    if (isValidationError(error)) {
      return validationErrorResponse(error);
    }

    return NextResponse.json({ task: failTask(task.id, error) }, { status: 500 });
  }
}
