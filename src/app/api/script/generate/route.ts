import { NextResponse } from "next/server";
import { validationErrorResponse } from "@/lib/api";
import { scriptGenerateSchema } from "@/lib/schemas";
import { appendTaskLog, completeTask, createTask, failTask, type TaskRecord, updateTask } from "@/lib/tasks";
import { generateScript, type ScriptInput } from "@/lib/script/generate";
import { tryCreateLLMClient } from "@/lib/llm/client";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const parsed = scriptGenerateSchema.safeParse(await request.json());
  if (!parsed.success) {
    return validationErrorResponse(parsed.error);
  }

  const input = parsed.data;
  const task = createTask("script-generate", `文案脚本 ${input.platform}/${input.topic.slice(0, 20)}`);
  const finishedTask = await runScript(task.id, input);
  return NextResponse.json({ task: finishedTask }, { status: finishedTask.status === "failed" ? 500 : 200 });
}

async function runScript(taskId: string, input: ScriptInput): Promise<TaskRecord> {
  try {
    updateTask(taskId, { status: "processing", progress: 20 });
    const client = tryCreateLLMClient();
    if (!client) {
      throw new Error("未配置 LLM(DEEPSEEK_API_KEY 等),无法生成文案脚本。请在 .env.local 配置后重试。");
    }
    appendTaskLog(taskId, "调用 LLM 生成文案脚本");
    const draft = await generateScript(input, client);
    return completeTask(taskId, draft);
  } catch (error) {
    return failTask(taskId, error);
  }
}
