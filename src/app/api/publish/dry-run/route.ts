import { NextResponse } from "next/server";
import { validationErrorResponse } from "@/lib/api";
import { dryRunPublish } from "@/lib/publish/dry-run";
import { publishDryRunSchema } from "@/lib/schemas";
import { appendTaskLog, completeTask, createTask, failTask, type TaskRecord, updateTask } from "@/lib/tasks";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const parsed = publishDryRunSchema.safeParse(await request.json());
  if (!parsed.success) {
    return validationErrorResponse(parsed.error);
  }

  const input = parsed.data;
  const task = createTask("publish-dry-run", `发布 dry-run ${input.platform}/${input.title.slice(0, 20)}`);
  const finishedTask = await runDryRun(task.id, input);
  return NextResponse.json({ task: finishedTask }, { status: finishedTask.status === "failed" ? 500 : 200 });
}

async function runDryRun(taskId: string, input: ReturnType<typeof publishDryRunSchema.parse>): Promise<TaskRecord> {
  try {
    updateTask(taskId, { status: "processing", progress: 30 });
    appendTaskLog(taskId, `校验 ${input.platform} 发布载荷(dry-run,不真发)`);
    const result = await dryRunPublish(input);
    appendTaskLog(taskId, result.willPublish ? "校验通过,可进入真实发布(后续接平台 API)" : "存在阻断项,先修复再发布");
    return completeTask(taskId, result);
  } catch (error) {
    return failTask(taskId, error);
  }
}
