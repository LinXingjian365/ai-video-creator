import { NextResponse } from "next/server";
import { validationErrorResponse } from "@/lib/api";
import { approvePublishQueueItem, PUBLISH_CONFIRM_TEXT } from "@/lib/publish/queue";
import { publishApproveSchema } from "@/lib/schemas";
import { appendTaskLog, completeTask, createTask, failTask, type TaskRecord, updateTask } from "@/lib/tasks";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const parsed = publishApproveSchema.safeParse(await request.json());
  if (!parsed.success) {
    return validationErrorResponse(parsed.error);
  }

  const task = createTask("publish-approve", `发布人工确认 ${parsed.data.id.slice(0, 8)}`);
  const finishedTask = await runApprove(task.id, parsed.data);
  return NextResponse.json(
    { task: finishedTask, confirmText: PUBLISH_CONFIRM_TEXT },
    { status: finishedTask.status === "failed" ? 500 : 200 }
  );
}

async function runApprove(taskId: string, input: ReturnType<typeof publishApproveSchema.parse>): Promise<TaskRecord> {
  try {
    updateTask(taskId, { status: "processing", progress: 50 });
    appendTaskLog(taskId, "校验人工确认口令并更新待发布队列。");
    const item = await approvePublishQueueItem(input.id, input.manualConfirm, input.note);
    appendTaskLog(taskId, "已进入 approved 状态。当前版本仍不会真实上传。");
    return completeTask(taskId, item);
  } catch (error) {
    return failTask(taskId, error);
  }
}
