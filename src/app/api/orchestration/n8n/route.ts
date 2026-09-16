import { NextResponse } from "next/server";
import { validationErrorResponse } from "@/lib/api";
import { buildN8nWorkflowBlueprint, exportN8nWorkflowFile, triggerN8nOrchestration } from "@/lib/orchestration/n8n";
import { n8nOrchestrationSchema } from "@/lib/schemas";
import { appendTaskLog, completeTask, createTask, failTask, type TaskRecord, updateTask } from "@/lib/tasks";

export const runtime = "nodejs";

export async function GET() {
  const baseUrl = process.env.APP_BASE_URL || process.env.NEXT_PUBLIC_APP_URL || "http://127.0.0.1:5182";
  return NextResponse.json({
    configured: Boolean(process.env.N8N_WEBHOOK_URL),
    livePublishEnabled: process.env.PUBLISH_LIVE_ENABLED === "true",
    blueprint: buildN8nWorkflowBlueprint(baseUrl)
  });
}

export async function POST(request: Request) {
  const parsed = n8nOrchestrationSchema.safeParse(await request.json());
  if (!parsed.success) {
    return validationErrorResponse(parsed.error);
  }

  const task = createTask("n8n-orchestration", `n8n ${parsed.data.mode} ${parsed.data.platform}/${parsed.data.topic.slice(0, 20)}`);
  const finishedTask = await runN8n(task.id, parsed.data);
  return NextResponse.json({ task: finishedTask }, { status: finishedTask.status === "failed" ? 500 : 200 });
}

async function runN8n(taskId: string, input: ReturnType<typeof n8nOrchestrationSchema.parse>): Promise<TaskRecord> {
  try {
    updateTask(taskId, { status: "processing", progress: 35 });
    appendTaskLog(taskId, "Build n8n full-chain workflow payload.");
    const result = await triggerN8nOrchestration(input);
    if (input.exportWorkflow) {
      appendTaskLog(taskId, "Export n8n importable workflow JSON.");
      result.workflowExport = await exportN8nWorkflowFile(input);
    }
    appendTaskLog(taskId, result.sent ? "n8n webhook sent." : result.message);
    return completeTask(taskId, result);
  } catch (error) {
    return failTask(taskId, error);
  }
}
