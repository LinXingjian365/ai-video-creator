import path from "node:path";
import { z } from "zod";
import { automaticPlanSchema } from "@/lib/schemas";

type AutomaticPlanInput = z.infer<typeof automaticPlanSchema>;

function splitInstructions(text: string) {
  return text
    .split(/[，。；;,\n]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function inferOperations(instructions: string) {
  const checks = [
    { id: "transcribe", when: /字幕|转录|Whisper|时间戳|逐字/.test(instructions), label: "Generate word-level transcript" },
    { id: "remove-fillers", when: /废话|嗯|啊|语气词|气口|停顿|紧凑/.test(instructions), label: "Remove filler words and long pauses" },
    { id: "select-takes", when: /最好|重拍|候选|镜头|素材|场景/.test(instructions), label: "Score candidate takes by script match and delivery quality" },
    { id: "subtitles", when: /字幕|大字幕|花字|粉色|居中/.test(instructions), label: "Create styled subtitles" },
    { id: "color", when: /调色|电影感|赛博朋克|青橙|Rec\.?709|LUT|滤镜/.test(instructions), label: "Prepare color look or LUT pass" },
    { id: "jianying", when: /剪映|草稿|可编辑/.test(instructions), label: "Export a JianYing editable draft plan" },
    { id: "remotion", when: /图形|遮罩|React|Remotion|Figma|动画/.test(instructions), label: "Align motion graphics from transcript keywords" }
  ];

  const matched = checks.filter((check) => check.when);
  return matched.length > 0 ? matched : checks.slice(0, 3);
}

export function createAutomaticPlan(input: AutomaticPlanInput) {
  const now = new Date().toISOString();
  const scenes = input.scenes.length > 0
    ? input.scenes
    : [
      { id: "scene-01", title: "Opening", keywords: ["intro", "right"], targetDurationMs: 45000 },
      { id: "scene-02", title: "Core demo", keywords: ["demo", "workflow"], targetDurationMs: 70000 },
      { id: "scene-03", title: "Closing", keywords: ["finally", "next"], targetDurationMs: 45000 }
    ];

  const operations = inferOperations(input.instructions);
  const instructionNotes = splitInstructions(input.instructions);

  return {
    schema: "ai-video-assistant.automatic-decision.v1",
    projectTitle: input.projectTitle,
    createdAt: now,
    materialDir: input.materialDir,
    transcriptPath: input.transcriptPath ?? path.join("workspace", "transcripts", `${slug(input.projectTitle)}.json`),
    outputPath: input.outputPath ?? path.join("workspace", "output", `${slug(input.projectTitle)}-rough-cut.mp4`),
    style: input.style,
    operations: operations.map((operation, index) => ({
      order: index + 1,
      id: operation.id,
      label: operation.label,
      status: "planned"
    })),
    decisionRules: [
      "Prefer takes with fewer filler words.",
      "Reject takes with long mid-sentence pauses unless the pause is intentional.",
      "Place in/out points on natural pauses or word boundaries.",
      "Keep written reasons for every selected and rejected candidate.",
      "Use word-level timestamps to align captions and motion graphics."
    ],
    scenes: scenes.map((scene, index) => ({
      id: scene.id,
      title: scene.title,
      order: index + 1,
      targetDurationMs: scene.targetDurationMs ?? null,
      keywords: scene.keywords,
      candidates: [],
      selectedClip: null,
      expectedDecisionFields: {
        clipId: "C003",
        inMs: 0,
        outMs: scene.targetDurationMs ?? 30000,
        reason: "Example: zero filler words and clean ending.",
        rejectedReasons: [
          "Example: C017 rejected because it has a 5800ms pause in the middle."
        ],
        fillerWordCount: 0,
        keywordFrameAnchors: scene.keywords.map((keyword) => ({ keyword, frame: null }))
      }
    })),
    notes: instructionNotes
  };
}

function slug(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/gi, "-")
    .replace(/^-+|-+$/g, "") || "auto-edit";
}
