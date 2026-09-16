import { NextResponse } from "next/server";
import { validationErrorResponse } from "@/lib/api";
import { runPublishPreflight } from "@/lib/publish/preflight";
import { publishPreflightSchema } from "@/lib/schemas";
import { appendTaskLog, completeTask, createTask, failTask, type TaskRecord, updateTask } from "@/lib/tasks";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const parsed = publishPreflightSchema.safeParse({
    probePostiz: searchParams.get("probePostiz") ?? false,
    platforms: searchParams.getAll("platforms")
  });
  if (!parsed.success) {
    return validationErrorResponse(parsed.error);
  }
  const report = await runPublishPreflight(parsed.data);
  return NextResponse.json({ report });
}

export async function POST(request: Request) {
  const parsed = publishPreflightSchema.safeParse(await request.json());
  if (!parsed.success) {
    return validationErrorResponse(parsed.error);
  }

  const task = createTask("publish-preflight", parsed.data.probePostiz ? "Publish account preflight + Postiz probe" : "Publish account preflight");
  const finishedTask = await runPreflight(task.id, parsed.data);
  return NextResponse.json({ task: finishedTask }, { status: finishedTask.status === "failed" ? 500 : 200 });
}

async function runPreflight(taskId: string, input: ReturnType<typeof publishPreflightSchema.parse>): Promise<TaskRecord> {
  try {
    updateTask(taskId, { status: "processing", progress: 45 });
    appendTaskLog(taskId, "Check Postiz/social-auto-upload publish readiness.");
    const report = await runPublishPreflight(input);
    appendTaskLog(taskId, `Publish preflight completed with ${report.blockers.length} blocker(s).`);
    return completeTask(taskId, report);
  } catch (error) {
    return failTask(taskId, error);
  }
}
