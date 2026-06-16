import { z } from "zod";

const codec = z.string().min(1).optional();
const quality = z.enum(["ultrafast", "fast", "medium", "slow", "veryslow"]).optional();
const optionalNumber = z.preprocess((value) => value === "" ? undefined : value, z.coerce.number().optional());
const optionalPositiveInt = z.preprocess((value) => value === "" ? undefined : value, z.coerce.number().int().positive().optional());
const optionalPositiveNumber = z.preprocess((value) => value === "" ? undefined : value, z.coerce.number().positive().optional());

export const videoInfoSchema = z.object({
  inputPath: z.string().min(1)
});

const clipVideoBaseSchema = z.object({
  inputPath: z.string().min(1),
  outputPath: z.string().min(1).optional(),
  startMs: z.coerce.number().int().min(0).optional(),
  endMs: z.coerce.number().int().positive().optional(),
  timeSegment: z.object({
    start: z.coerce.number().int().min(0),
    end: z.coerce.number().int().positive()
  }).optional(),
  quality,
  videoCodec: codec,
  audioCodec: codec,
  preserveMetadata: z.coerce.boolean().optional()
});

export const clipVideoSchema = clipVideoBaseSchema.transform((value) => ({
  ...value,
  startMs: value.startMs ?? value.timeSegment?.start,
  endMs: value.endMs ?? value.timeSegment?.end
})).pipe(z.object({
  inputPath: z.string().min(1),
  outputPath: z.string().min(1).optional(),
  startMs: z.number().int().min(0),
  endMs: z.number().int().positive(),
  quality,
  videoCodec: codec,
  audioCodec: codec,
  preserveMetadata: z.boolean().optional()
}).refine((value) => value.endMs > value.startMs, {
  message: "endMs must be greater than startMs",
  path: ["endMs"]
}));

const mergeVideosBaseSchema = z.object({
  inputPaths: z.array(z.string().min(1)).min(2),
  outputPath: z.string().min(1).optional(),
  quality,
  videoCodec: codec,
  audioCodec: codec,
  width: optionalPositiveInt,
  height: optionalPositiveInt,
  fps: optionalPositiveNumber,
  resolution: z.object({
    width: z.coerce.number().int().positive(),
    height: z.coerce.number().int().positive()
  }).optional()
});

export const mergeVideosSchema = mergeVideosBaseSchema.transform((value) => ({
  ...value,
  width: value.width ?? value.resolution?.width,
  height: value.height ?? value.resolution?.height
}));

export const splitVideoSchema = z.object({
  inputPath: z.string().min(1),
  outputDir: z.string().min(1).optional(),
  splitBy: z.enum(["duration", "size", "segments"]),
  durationSeconds: optionalPositiveNumber,
  duration: optionalPositiveNumber,
  maxSize: optionalPositiveNumber,
  segmentCount: optionalPositiveInt,
  namePattern: z.string().min(1).optional()
}).transform((value) => ({
  ...value,
  durationSeconds: value.durationSeconds ?? value.duration
})).refine((value) => {
  if (value.splitBy === "duration") {
    return Boolean(value.durationSeconds);
  }
  if (value.splitBy === "size") {
    return Boolean(value.maxSize);
  }
  return Boolean(value.segmentCount);
}, {
  message: "Provide durationSeconds, maxSize, or segmentCount for the selected split mode."
});

export const jianyingPlanSchema = z.object({
  title: z.string().min(1),
  aspectRatio: z.enum(["16:9", "9:16", "1:1"]).default("16:9"),
  outputPath: z.string().min(1).optional(),
  segments: z.array(z.object({
    type: z.enum(["video", "audio", "text"]),
    source: z.string().optional(),
    text: z.string().optional(),
    startMs: z.coerce.number().int().min(0),
    durationMs: z.coerce.number().int().positive(),
    track: z.string().default("main")
  })).min(1)
});

export const jianyingDraftSegmentSchema = z.object({
  type: z.enum(["video", "audio", "text"]),
  source: z.string().optional(),
  text: z.string().optional(),
  startMs: z.coerce.number().int().min(0),
  durationMs: z.coerce.number().int().positive(),
  sourceInMs: z.coerce.number().int().min(0).optional(),
  sourceOutMs: z.coerce.number().int().positive().optional(),
  track: z.string().default("main")
});

export const jianyingDraftSchema = z.object({
  draftName: z.string().min(1).optional(),
  planPath: z.string().min(1).optional(),
  title: z.string().min(1).optional(),
  aspectRatio: z.enum(["16:9", "9:16", "1:1"]).default("16:9"),
  segments: z.array(jianyingDraftSegmentSchema).optional()
}).refine((value) => Boolean(value.planPath) || (value.segments && value.segments.length > 0), {
  message: "Provide planPath or a non-empty segments array.",
  path: ["planPath"]
});

export const automaticPlanSchema = z.object({
  projectTitle: z.string().min(1).default("Auto edit"),
  script: z.string().optional(),
  materialDir: z.string().min(1).default("workspace/input"),
  outputPath: z.string().min(1).optional(),
  transcriptPath: z.string().min(1).optional(),
  instructions: z.string().min(1),
  scenes: z.array(z.object({
    id: z.string().min(1),
    title: z.string().min(1),
    keywords: z.array(z.string()).default([]),
    targetDurationMs: optionalPositiveInt
  })).default([]),
  style: z.object({
    cutPace: z.enum(["tight", "normal", "slow"]).default("tight"),
    colorLook: z.string().default("neutral Rec.709"),
    subtitleStyle: z.string().default("large centered captions"),
    aspectRatio: z.enum(["16:9", "9:16", "1:1"]).default("16:9")
  }).default({})
});

export const automaticClipSchema = z.object({
  inputPath: z.string().min(1),
  startMs: z.coerce.number().int().min(0),
  endMs: z.coerce.number().int().positive(),
  label: z.string().min(1).optional()
}).refine((value) => value.endMs > value.startMs, {
  message: "endMs must be greater than startMs",
  path: ["endMs"]
});

export const automaticRenderSchema = z.object({
  projectTitle: z.string().min(1).default("Auto render"),
  planPath: z.string().min(1).optional(),
  inputPath: z.string().min(1).optional(),
  materialDir: z.string().min(1).default("workspace/input"),
  outputPath: z.string().min(1).optional(),
  clips: z.array(automaticClipSchema).optional(),
  draftPlanOutputPath: z.string().min(1).optional()
});

export const automaticSimulationSchema = z.object({
  projectTitle: z.string().min(1).default("模拟自动剪辑"),
  instructions: z.string().min(1).default("做一个紧凑的口播短视频，剪掉前后冗余，保留三个高信息密度片段，生成可编辑剪映草稿计划。"),
  outputPath: z.string().min(1).optional()
});

export const mcpConfigSchema = z.object({
  jianyingProjectPath: z.string().min(1).optional(),
  savePath: z.string().min(1).optional(),
  outputPath: z.string().min(1).optional(),
  includeVideoClip: z.coerce.boolean().default(true),
  videoClipVersion: z.string().min(1).default("latest")
});

export const creatorSuiteSchema = z.object({
  niche: z.string().min(1),
  audience: z.string().min(1),
  persona: z.string().min(1).optional(),
  platforms: z.array(z.enum(["douyin", "kuaishou", "bilibili"])).min(1).default(["douyin", "kuaishou", "bilibili"]),
  keywords: z.array(z.string().min(1)).default([]),
  references: z.array(z.string().min(1)).default([]),
  materialNeeds: z.string().min(1).optional(),
  campaignGoal: z.string().min(1).default("涨粉、互动、转化"),
  webSearchEnabled: z.coerce.boolean().default(true),
  competitorStyle: z.string().min(1).optional(),
  riskTolerance: z.enum(["low", "medium", "high"]).default("medium")
});

export const trendReportSchema = z.object({
  platform: z.enum(["bilibili"]).default("bilibili"),
  category: z.string().min(1).default("all"),
  topN: z.coerce.number().int().min(1).max(50).default(20)
});
