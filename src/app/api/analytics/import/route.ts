import { NextResponse } from "next/server";
import { validationErrorResponse } from "@/lib/api";
import { importAnalyticsSnapshot, readAnalyticsLedger } from "@/lib/analytics/ledger";
import { analyticsImportSchema } from "@/lib/schemas";
import { appendTaskLog, completeTask, createTask, failTask, type TaskRecord, updateTask } from "@/lib/tasks";

export const runtime = "nodejs";

export async function GET() {
  const ledger = await readAnalyticsLedger();
  return NextResponse.json({ ledger });
}

export async function POST(request: Request) {
  const parsed = analyticsImportSchema.safeParse(await request.json());
  if (!parsed.success) {
    return validationErrorResponse(parsed.error);
  }

  const task = createTask("analytics-import", `数据回流 ${parsed.data.platform}/${parsed.data.window}`);
  const finishedTask = await runImport(task.id, parsed.data);
  return NextResponse.json({ task: finishedTask }, { status: finishedTask.status === "failed" ? 500 : 200 });
}

async function runImport(taskId: string, input: ReturnType<typeof analyticsImportSchema.parse>): Promise<TaskRecord> {
  try {
    updateTask(taskId, { status: "processing", progress: 60 });
    appendTaskLog(taskId, `导入 ${input.platform} ${input.window} 指标快照。`);
    const snapshot = await importAnalyticsSnapshot(input);
    appendTaskLog(taskId, `数据回流完成:互动率 ${(snapshot.signals.engagementRate * 100).toFixed(2)}%。`);
    return completeTask(taskId, snapshot);
  } catch (error) {
    return failTask(taskId, error);
  }
}
