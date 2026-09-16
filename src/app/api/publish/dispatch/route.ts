import { NextResponse } from "next/server";
import { validationErrorResponse } from "@/lib/api";
import { dispatchPublishQueueItem } from "@/lib/publish/dispatch";
import { publishDispatchSchema } from "@/lib/schemas";
import { appendTaskLog, completeTask, createTask, failTask, type TaskRecord, updateTask } from "@/lib/tasks";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const parsed = publishDispatchSchema.safeParse(await request.json());
  if (!parsed.success) {
    return validationErrorResponse(parsed.error);
  }

  const task = createTask("publish-dispatch", `发布 dispatch ${parsed.data.id.slice(0, 8)}`);
  const finishedTask = await runDispatch(task.id, parsed.data);
  return NextResponse.json({ task: finishedTask }, { status: finishedTask.status === "failed" ? 500 : 200 });
}

async function runDispatch(taskId: string, input: ReturnType<typeof publishDispatchSchema.parse>): Promise<TaskRecord> {
  try {
    updateTask(taskId, { status: "processing", progress: 50 });
    appendTaskLog(taskId, "检查 approved 队列项和发布 adapter。");
    const result = await dispatchPublishQueueItem(input);
    appendTaskLog(taskId, result.sent ? result.message : `${result.message} 未执行真实上传。`);
    return completeTask(taskId, result);
  } catch (error) {
    return failTask(taskId, error);
  }
}
