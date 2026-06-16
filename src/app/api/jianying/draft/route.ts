import fs from "node:fs/promises";
import { NextResponse } from "next/server";
import { badRequest, validationErrorResponse } from "@/lib/api";
import { generateJianyingDraft } from "@/lib/jianying-draft";
import { assertInputFile, PathValidationError, resolveLocalPath } from "@/lib/paths";
import { jianyingDraftSchema } from "@/lib/schemas";
import { appendTaskLog, completeTask, createTask, failTask, updateTask } from "@/lib/tasks";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const parsed = jianyingDraftSchema.safeParse(await request.json());
  if (!parsed.success) {
    return validationErrorResponse(parsed.error);
  }

  const payload = parsed.data;

  let plan: { aspectRatio: string; segments: unknown[]; title?: string };
  try {
    if (payload.planPath) {
      const planPath = resolveLocalPath(payload.planPath);
      assertInputFile(planPath);
      plan = JSON.parse(await fs.readFile(planPath, "utf8"));
    } else {
      plan = {
        title: payload.title,
        aspectRatio: payload.aspectRatio,
        segments: payload.segments ?? []
      };
    }
  } catch (error) {
    if (error instanceof PathValidationError) {
      return badRequest(error.message);
    }
    return badRequest(`无法读取 plan: ${error instanceof Error ? error.message : String(error)}`);
  }

  const draftName = payload.draftName ?? payload.title ?? plan.title ?? `AI助手草稿-${Date.now()}`;
  const task = createTask("jianying-draft", `JianYing draft ${draftName}`);

  void runDraft(task.id, plan, draftName);

  return NextResponse.json({ task });
}

async function runDraft(taskId: string, plan: unknown, draftName: string) {
  try {
    updateTask(taskId, { status: "processing", progress: 10 });
    const result = await generateJianyingDraft({
      plan,
      draftName,
      onLog: (message) => appendTaskLog(taskId, message)
    });
    completeTask(taskId, result);
  } catch (error) {
    failTask(taskId, error);
  }
}
