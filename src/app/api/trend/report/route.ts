import { NextResponse } from "next/server";
import { validationErrorResponse } from "@/lib/api";
import { trendReportSchema } from "@/lib/schemas";
import { appendTaskLog, completeTask, createTask, failTask, updateTask } from "@/lib/tasks";
import { bilibiliSource } from "@/lib/trend/sources/bilibili";
import { buildReport } from "@/lib/trend/report";
import { tryCreateLLMClient } from "@/lib/llm/client";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const parsed = trendReportSchema.safeParse(await request.json());
  if (!parsed.success) {
    return validationErrorResponse(parsed.error);
  }

  const { platform, category, topN } = parsed.data;
  const task = createTask("trend-report", `热点情报 ${platform}/${category} top${topN}`);

  void runReport(task.id, category, topN);

  return NextResponse.json({ task });
}

async function runReport(taskId: string, category: string, topN: number) {
  try {
    updateTask(taskId, { status: "processing", progress: 10 });
    const client = tryCreateLLMClient();
    const report = await buildReport({
      platform: "bilibili",
      category,
      source: bilibiliSource,
      client,
      topN,
      nowMs: Date.now(),
      onLog: (msg) => appendTaskLog(taskId, msg),
    });
    completeTask(taskId, report);
  } catch (error) {
    failTask(taskId, error);
  }
}
