import { NextResponse } from "next/server";
import { validationErrorResponse } from "@/lib/api";
import { runFullChain } from "@/lib/full-chain";
import { tryCreateLLMClient } from "@/lib/llm/client";
import { fullChainSchema } from "@/lib/schemas";
import { appendTaskLog, completeTask, createTask, failTask, updateTask } from "@/lib/tasks";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const parsed = fullChainSchema.safeParse(await request.json());
  if (!parsed.success) {
    return validationErrorResponse(parsed.error);
  }

  const task = createTask("full-chain", `一键全链路 ${parsed.data.platform}/${parsed.data.topic.slice(0, 20)}`);
  void runChain(task.id, parsed.data);

  return NextResponse.json({ task });
}

async function runChain(taskId: string, payload: ReturnType<typeof fullChainSchema.parse>) {
  try {
    updateTask(taskId, { status: "processing", progress: 2 });
    const client = tryCreateLLMClient();
    if (!client) {
      throw new Error("未配置 LLM(DEEPSEEK_API_KEY 等),无法生成文案脚本。请在 .env.local 配置后重试。");
    }
    const result = await runFullChain(payload, client, {
      onLog: (message) => appendTaskLog(taskId, message),
      onProgress: (progress) => updateTask(taskId, { progress })
    });
    appendTaskLog(taskId, `全链路完成:成片 ${result.packageVideoPath}, ${result.variants.variants.length} 个平台变体`);
    return completeTask(taskId, result);
  } catch (error) {
    return failTask(taskId, error);
  }
}
