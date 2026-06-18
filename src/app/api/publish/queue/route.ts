import { NextResponse } from "next/server";
import { validationErrorResponse } from "@/lib/api";
import { listPublishAdapterStatus } from "@/lib/publish/adapters";
import { createPublishQueueItem, readPublishQueue } from "@/lib/publish/queue";
import { publishQueueSchema } from "@/lib/schemas";
import { appendTaskLog, completeTask, createTask, failTask, type TaskRecord, updateTask } from "@/lib/tasks";

export const runtime = "nodejs";

export async function GET() {
  const queue = await readPublishQueue();
  return NextResponse.json({ queue, adapters: listPublishAdapterStatus() });
}

export async function POST(request: Request) {
  const parsed = publishQueueSchema.safeParse(await request.json());
  if (!parsed.success) {
    return validationErrorResponse(parsed.error);
  }

  const input = parsed.data;
  const task = createTask("publish-queue", `发布队列 ${input.platform}/${input.title.slice(0, 20)}`);
  const finishedTask = await runQueueCreate(task.id, input);
  return NextResponse.json({ task: finishedTask }, { status: finishedTask.status === "failed" ? 500 : 200 });
}

async function runQueueCreate(taskId: string, input: ReturnType<typeof publishQueueSchema.parse>): Promise<TaskRecord> {
  try {
    updateTask(taskId, { status: "processing", progress: 30 });
    appendTaskLog(taskId, `创建 ${input.platform} 待发布队列项(先 dry-run,不真发)。`);
    const item = await createPublishQueueItem(input);
    appendTaskLog(taskId, item.status === "ready" ? "队列项已就绪,等待人工确认。" : "dry-run 存在阻断项,队列项已标记 blocked。");
    return completeTask(taskId, item);
  } catch (error) {
    return failTask(taskId, error);
  }
}
