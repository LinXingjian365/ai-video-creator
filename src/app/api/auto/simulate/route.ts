import fs from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { validationErrorResponse } from "@/lib/api";
import { createAutomaticPlan } from "@/lib/auto-plan";
import { renderAutomaticCut } from "@/lib/auto-render";
import { createTestVideo, getVideoInfo } from "@/lib/ffmpeg";
import { defaultDraftPath, defaultOutputPath, inputRoot, resolveLocalPath } from "@/lib/paths";
import { automaticSimulationSchema } from "@/lib/schemas";
import { appendTaskLog, completeTask, createTask, failTask, updateTask } from "@/lib/tasks";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const parsed = automaticSimulationSchema.safeParse(await request.json());
  if (!parsed.success) {
    return validationErrorResponse(parsed.error);
  }

  const payload = parsed.data;
  const task = createTask("auto-simulate", `Simulate ${payload.projectTitle}`);

  void runSimulation(task.id, payload);

  return NextResponse.json({ task });
}

async function runSimulation(taskId: string, payload: ReturnType<typeof automaticSimulationSchema.parse>) {
  try {
    updateTask(taskId, { status: "processing", progress: 2 });
    const stamp = Date.now();
    const sampleDir = path.join(inputRoot, "simulated");
    const samplePath = path.join(sampleDir, `sample-${stamp}.mp4`);
    appendTaskLog(taskId, `Generating local test material: ${samplePath}`);
    await createTestVideo({
      outputPath: samplePath,
      durationSeconds: 12,
      label: payload.projectTitle,
      frequency: 660
    });
    updateTask(taskId, { progress: 22 });

    const info = await getVideoInfo(samplePath);
    appendTaskLog(taskId, `Sample ready: ${info.width}x${info.height}, ${info.duration}s.`);

    const plan = createAutomaticPlan({
      projectTitle: payload.projectTitle,
      materialDir: sampleDir,
      outputPath: payload.outputPath ?? defaultOutputPath(`simulate-${stamp}-rough-cut.mp4`),
      instructions: payload.instructions,
      scenes: [
        { id: "hook", title: "强钩子", keywords: ["hook"], targetDurationMs: 2500 },
        { id: "demo", title: "核心演示", keywords: ["demo"], targetDurationMs: 3500 },
        { id: "close", title: "结尾行动", keywords: ["cta"], targetDurationMs: 2500 }
      ],
      style: {
        cutPace: "tight",
        colorLook: "neutral Rec.709",
        subtitleStyle: "large centered captions",
        aspectRatio: "16:9"
      }
    });

    const planPath = resolveLocalPath(defaultDraftPath(`simulate-${stamp}-decision.json`));
    await fs.mkdir(path.dirname(planPath), { recursive: true });
    await fs.writeFile(planPath, JSON.stringify(plan, null, 2), "utf8");
    updateTask(taskId, { progress: 35 });

    const renderResult = await renderAutomaticCut({
      projectTitle: payload.projectTitle,
      planPath,
      inputPath: samplePath,
      outputPath: payload.outputPath ?? defaultOutputPath(`simulate-${stamp}-rough-cut.mp4`),
      materialDir: sampleDir
    }, {
      onProgress: (progress) => updateTask(taskId, { progress: 35 + Math.round(progress * 0.62) }),
      onLog: (message) => appendTaskLog(taskId, message)
    });

    const outputInfo = await getVideoInfo(renderResult.outputPath);
    completeTask(taskId, {
      samplePath,
      sampleInfo: info,
      decisionPath: planPath,
      render: renderResult,
      outputInfo
    });
  } catch (error) {
    failTask(taskId, error);
  }
}
