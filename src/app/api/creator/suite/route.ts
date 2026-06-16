import fs from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { validationErrorResponse } from "@/lib/api";
import { createCreatorSuitePlan } from "@/lib/creator-suite";
import { defaultDraftPath, resolveLocalPath } from "@/lib/paths";
import { creatorSuiteSchema } from "@/lib/schemas";
import { completeTask, createTask, failTask, updateTask } from "@/lib/tasks";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const parsed = creatorSuiteSchema.safeParse(await request.json());
  if (!parsed.success) {
    return validationErrorResponse(parsed.error);
  }

  const payload = parsed.data;
  const task = createTask("creator-suite", `Creator suite ${payload.niche}`);
  const plan = createCreatorSuitePlan(payload);
  const outputPath = resolveLocalPath(defaultDraftPath(`${Date.now()}-creator-suite.json`));

  try {
    updateTask(task.id, { status: "processing", progress: 45 });
    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    await fs.writeFile(outputPath, JSON.stringify(plan, null, 2), "utf8");
    return NextResponse.json({ task: completeTask(task.id, { outputPath, plan }) });
  } catch (error) {
    return NextResponse.json({ task: failTask(task.id, error) }, { status: 500 });
  }
}
