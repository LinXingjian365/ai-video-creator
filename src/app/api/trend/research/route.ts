import { NextResponse } from "next/server";
import { validationErrorResponse } from "@/lib/api";
import { tikhubResearchSchema } from "@/lib/schemas";
import { appendTaskLog, completeTask, createTask, failTask, type TaskRecord, updateTask } from "@/lib/tasks";
import { runTikHubResearch } from "@/lib/trend/research";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const parsed = tikhubResearchSchema.safeParse(await request.json());
  if (!parsed.success) {
    return validationErrorResponse(parsed.error);
  }

  const task = createTask("trend-research", `TikHub research ${parsed.data.platform}`);
  const finalTask = await runResearch(task.id, parsed.data);
  return NextResponse.json({ task: finalTask }, { status: finalTask.status === "failed" ? 500 : 200 });
}

async function runResearch(taskId: string, input: ReturnType<typeof tikhubResearchSchema.parse>): Promise<TaskRecord> {
  try {
    updateTask(taskId, { status: "processing", progress: 15 });
    appendTaskLog(taskId, "Running TikHub competitor research.");
    const report = await runTikHubResearch(input);
    appendTaskLog(taskId, `Research completed: ${report.searchItems.length} search item(s), ${report.comments.length} comment(s).`);
    return completeTask(taskId, report);
  } catch (error) {
    return failTask(taskId, error);
  }
}
