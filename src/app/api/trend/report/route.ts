import { NextResponse } from "next/server";
import { validationErrorResponse } from "@/lib/api";
import { tryCreateLLMClient } from "@/lib/llm/client";
import { trendReportSchema } from "@/lib/schemas";
import { appendTaskLog, completeTask, createTask, failTask, updateTask } from "@/lib/tasks";
import { buildReport } from "@/lib/trend/report";
import { bilibiliSource } from "@/lib/trend/sources/bilibili";

export const runtime = "nodejs";

const DEFAULT_TASK_TIMEOUT_MS = 60000;
const DEFAULT_LLM_TIMEOUT_MS = 30000;

function taskTimeoutMs(): number {
  const llmTimeout = Number(process.env.LLM_TIMEOUT_MS ?? 45000);
  const timeout = Number.isFinite(llmTimeout) && llmTimeout > 0 ? llmTimeout + 15000 : DEFAULT_TASK_TIMEOUT_MS;
  return Math.max(timeout, DEFAULT_TASK_TIMEOUT_MS);
}

function withTaskTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`Trend report task timed out after ${timeoutMs}ms`)), timeoutMs);
  });

  return Promise.race([promise, timeout]).finally(() => {
    if (timer) {
      clearTimeout(timer);
    }
  });
}

export async function POST(request: Request) {
  const parsed = trendReportSchema.safeParse(await request.json());
  if (!parsed.success) {
    return validationErrorResponse(parsed.error);
  }

  const { platform, category, topN } = parsed.data;
  const task = createTask("trend-report", `Trend report ${platform}/${category} top${topN}`);
  const finalTask = await runReport(task.id, category, topN);

  return NextResponse.json(
    { task: finalTask },
    { status: finalTask.status === "failed" ? 500 : 200 }
  );
}

async function runReport(taskId: string, category: string, topN: number) {
  try {
    updateTask(taskId, { status: "processing", progress: 10 });
    const client = tryCreateLLMClient();
    const report = await withTaskTimeout(
      buildReport({
        platform: "bilibili",
        category,
        source: bilibiliSource,
        client,
        topN,
        nowMs: Date.now(),
        llmTimeoutMs: DEFAULT_LLM_TIMEOUT_MS,
        onLog: (message) => appendTaskLog(taskId, message)
      }),
      taskTimeoutMs()
    );
    return completeTask(taskId, report);
  } catch (error) {
    return failTask(taskId, error);
  }
}
