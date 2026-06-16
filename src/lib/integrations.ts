export interface IntegrationCapability {
  id: string;
  name: string;
  category: "core" | "transcription" | "scene-detection" | "silence-cut" | "rendering" | "timeline" | "draft" | "cloud";
  maturity: "built-in" | "recommended" | "optional" | "later";
  source: string;
  url: string;
  install?: string;
  fit: string;
  projectUse: string[];
  cautions: string[];
}

export const integrationCatalog: IntegrationCapability[] = [
  {
    id: "ffmpeg-core",
    name: "FFmpeg / fluent-ffmpeg",
    category: "core",
    maturity: "built-in",
    source: "Local Node package",
    url: "https://ffmpeg.org/",
    fit: "Reliable local encode, trim, concat, split, probes, LUT filters, subtitles, and format conversion.",
    projectUse: ["video info", "clip", "merge", "split", "rough cut render", "LUT pass"],
    cautions: ["Complex filter graphs should be generated from structured JSON, not free text."]
  },
  {
    id: "video-clip-mcp",
    name: "Video Clip MCP",
    category: "core",
    maturity: "optional",
    source: "@pickstar-2002/video-clip-mcp",
    url: "https://www.npmjs.com/package/@pickstar-2002/video-clip-mcp",
    install: "npx @pickstar-2002/video-clip-mcp@latest",
    fit: "MCP-compatible wrapper around FFmpeg style operations.",
    projectUse: ["external MCP compatibility", "batch clip/merge/split bridge"],
    cautions: ["Current app already has an internal FFmpeg core, so this should remain optional."]
  },
  {
    id: "jianying-mcp",
    name: "JianYing MCP",
    category: "draft",
    maturity: "recommended",
    source: "hey-jian-wei/jianying-mcp",
    url: "https://github.com/hey-jian-wei/jianying-mcp",
    install: "uv sync",
    fit: "Creates editable JianYing drafts through MCP tools.",
    projectUse: ["editable draft export", "tracks", "text effects", "transitions", "filters"],
    cautions: ["Requires Python 3.13+, uv, local path configuration, and careful ID handoff."]
  },
  {
    id: "whisper",
    name: "Whisper / word-level transcription",
    category: "transcription",
    maturity: "recommended",
    source: "OpenAI Whisper ecosystem",
    url: "https://github.com/openai/whisper",
    fit: "Provides transcript text and timestamps for captions, cut points, filler-word scoring, and graphics anchors.",
    projectUse: ["transcripts/*.json", "caption timing", "keyword frame anchors", "candidate scoring"],
    cautions: ["Use word timestamps when available; validate names and domain terms manually."]
  },
  {
    id: "pyscenedetect",
    name: "PySceneDetect",
    category: "scene-detection",
    maturity: "recommended",
    source: "PySceneDetect",
    url: "https://www.scenedetect.com/docs/latest/",
    install: "pip install scenedetect[opencv]",
    fit: "Detects shot changes and scene boundaries from video content.",
    projectUse: ["candidate segmentation", "scene thumbnail extraction", "cut boundary suggestions"],
    cautions: ["Detection thresholds need tuning per content style."]
  },
  {
    id: "auto-editor",
    name: "Auto-Editor",
    category: "silence-cut",
    maturity: "recommended",
    source: "WyattBlue/auto-editor",
    url: "https://github.com/WyattBlue/auto-editor",
    install: "pip install auto-editor",
    fit: "Automatically cuts video/audio by analyzing loudness and other methods.",
    projectUse: ["remove silence", "tighten talking-head cuts", "draft jump-cut baseline"],
    cautions: ["Needs review pass so natural breathing and intentional pauses are not overcut."]
  },
  {
    id: "remotion",
    name: "Remotion",
    category: "rendering",
    maturity: "recommended",
    source: "remotion.dev",
    url: "https://www.remotion.dev/",
    install: "npx create-video@latest",
    fit: "Uses React components and props to render programmatic video, captions, overlays, and motion graphics.",
    projectUse: ["React graphic components", "keyword-to-frame overlays", "final render layer"],
    cautions: ["Keep it as a second-stage package until the FFmpeg rough-cut loop is stable."]
  },
  {
    id: "opentimelineio",
    name: "OpenTimelineIO",
    category: "timeline",
    maturity: "optional",
    source: "Academy Software Foundation",
    url: "https://opentimelineio.readthedocs.io/en/latest/",
    install: "pip install OpenTimelineIO",
    fit: "Editorial timeline interchange format and API for cuts and external media references.",
    projectUse: ["decision JSON export", "NLE interchange", "modern EDL output"],
    cautions: ["It stores editorial structure, not media files."]
  },
  {
    id: "shotstack",
    name: "Shotstack-style JSON timeline",
    category: "cloud",
    maturity: "later",
    source: "Shotstack API pattern",
    url: "https://shotstack.io/",
    fit: "Cloud render APIs popularized JSON timelines for automated video generation.",
    projectUse: ["timeline schema inspiration", "future cloud render adapter"],
    cautions: ["Keep local-first by default; cloud rendering has cost, privacy, and upload constraints."]
  },
  {
    id: "figma-mcp",
    name: "Figma MCP / design handoff",
    category: "rendering",
    maturity: "optional",
    source: "Figma MCP pattern",
    url: "https://www.figma.com/",
    fit: "Lets AI read design components and sync them back into code-based video overlays.",
    projectUse: ["design-to-Remotion", "color controls", "designer review loop"],
    cautions: ["Requires Figma access and a clear component naming convention."]
  }
];
