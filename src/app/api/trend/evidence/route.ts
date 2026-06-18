import { NextResponse } from "next/server";
import { validationErrorResponse } from "@/lib/api";
import { evidenceSearchSchema } from "@/lib/schemas";
import { appendTaskLog, completeTask, createTask, failTask, type TaskRecord, updateTask } from "@/lib/tasks";
import { runEvidenceSearch } from "@/lib/trend/evidence";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const parsed = evidenceSearchSchema.safeParse(await request.json());
  if (!parsed.success) {
    return validationErrorResponse(parsed.error);
  }

  const task = createTask("trend-evidence", `Evidence search ${parsed.data.provider}:${parsed.data.query.slice(0, 40)}`);
  const finalTask = await runEvidence(task.id, parsed.data);
  return NextResponse.json({ task: finalTask }, { status: finalTask.status === "failed" ? 500 : 200 });
}

async function runEvidence(taskId: string, input: ReturnType<typeof evidenceSearchSchema.parse>): Promise<TaskRecord> {
  try {
    updateTask(taskId, { status: "processing", progress: 15 });
    appendTaskLog(taskId, `Running evidence search (provider=${input.provider}).`);
    const report = await runEvidenceSearch(input);
    appendTaskLog(taskId, `Evidence search completed: ${report.results.length} result(s) via ${report.provider}.`);
    return completeTask(taskId, report);
  } catch (error) {
    return failTask(taskId, error);
  }
}
