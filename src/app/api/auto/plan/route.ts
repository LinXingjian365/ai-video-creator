import fs from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { validationErrorResponse } from "@/lib/api";
import { createAutomaticPlan } from "@/lib/auto-plan";
import { defaultDraftPath, resolveLocalPath } from "@/lib/paths";
import { automaticPlanSchema } from "@/lib/schemas";
import { completeTask, createTask, failTask, updateTask } from "@/lib/tasks";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const parsed = automaticPlanSchema.safeParse(await request.json());
  if (!parsed.success) {
    return validationErrorResponse(parsed.error);
  }

  const payload = parsed.data;
  const task = createTask("auto-plan", `Auto plan ${payload.projectTitle}`);
  const plan = createAutomaticPlan(payload);
  const outputPath = resolveLocalPath(payload.outputPath ?? defaultDraftPath(`${Date.now()}-auto-decision.json`));

  try {
    updateTask(task.id, { status: "processing", progress: 30 });
    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    await fs.writeFile(outputPath, JSON.stringify(plan, null, 2), "utf8");
    return NextResponse.json({ task: completeTask(task.id, { outputPath, plan }) });
  } catch (error) {
    return NextResponse.json({ task: failTask(task.id, error) }, { status: 500 });
  }
}
