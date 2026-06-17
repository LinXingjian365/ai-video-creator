import { describe, expect, it } from "vitest";
import { buildCandidateClips, buildSpeechRanges, parseSilenceDetectOutput, parseSubtitle } from "./analysis";

describe("parseSubtitle", () => {
  it("parses srt timestamps and text", () => {
    const segments = parseSubtitle([
      "1",
      "00:00:01,200 --> 00:00:03,400",
      "前三秒钩子来了",
      "",
      "2",
      "00:00:04,000 --> 00:00:05,500",
      "继续解释方法"
    ].join("\n"));

    expect(segments).toEqual([
      { index: 1, startMs: 1200, endMs: 3400, text: "前三秒钩子来了" },
      { index: 2, startMs: 4000, endMs: 5500, text: "继续解释方法" }
    ]);
  });

  it("parses webvtt and strips tags", () => {
    const segments = parseSubtitle([
      "WEBVTT",
      "",
      "00:00:02.000 --> 00:00:04.250",
      "<c>这个反差点要保留</c>"
    ].join("\n"));

    expect(segments[0]).toEqual({
      index: 1,
      startMs: 2000,
      endMs: 4250,
      text: "这个反差点要保留"
    });
  });
});

describe("buildCandidateClips", () => {
  it("prefers subtitle cues when transcript exists", () => {
    const clips = buildCandidateClips({
      transcriptSegments: [
        { index: 1, startMs: 1000, endMs: 2500, text: "这是一个值得保留的强钩子！" }
      ],
      speechRanges: [],
      scenes: [],
      durationMs: 12000,
      minClipMs: 1000,
      targetClipMs: 6000
    });

    expect(clips[0]).toMatchObject({
      id: "subtitle-1",
      startMs: 500,
      source: "subtitle"
    });
    expect(clips[0].endMs).toBeGreaterThan(clips[0].startMs);
  });

  it("uses scene changes when transcript is empty", () => {
    const clips = buildCandidateClips({
      transcriptSegments: [],
      speechRanges: [],
      scenes: [{ index: 1, timeMs: 3000, confidence: 30, source: "ffmpeg-scene" }],
      durationMs: 12000,
      minClipMs: 1000,
      targetClipMs: 6000
    });

    expect(clips[0]).toMatchObject({
      id: "scene-1",
      startMs: 3000,
      source: "scene"
    });
  });

  it("uses speech ranges before falling back", () => {
    const clips = buildCandidateClips({
      transcriptSegments: [],
      speechRanges: [
        { index: 1, startMs: 1200, endMs: 7200, durationMs: 6000, source: "ffmpeg-speech" }
      ],
      scenes: [],
      durationMs: 12000,
      minClipMs: 1000,
      targetClipMs: 5000
    });

    expect(clips[0]).toMatchObject({
      id: "speech-1",
      startMs: 1200,
      endMs: 6200,
      source: "speech"
    });
  });

  it("falls back to evenly spaced clips when no signal exists", () => {
    const clips = buildCandidateClips({
      transcriptSegments: [],
      speechRanges: [],
      scenes: [],
      durationMs: 18000,
      minClipMs: 1000,
      targetClipMs: 6000
    });

    expect(clips).toHaveLength(3);
    expect(clips[0].source).toBe("fallback");
  });
});

describe("silence detection helpers", () => {
  it("parses ffmpeg silencedetect output", () => {
    const silences = parseSilenceDetectOutput([
      "[silencedetect @ 000001] silence_start: 2.4",
      "[silencedetect @ 000001] silence_end: 4.1 | silence_duration: 1.7",
      "[silencedetect @ 000001] silence_start: 8",
      "[silencedetect @ 000001] silence_end: 9.25 | silence_duration: 1.25"
    ].join("\n"));

    expect(silences).toEqual([
      { index: 1, startMs: 2400, endMs: 4100, durationMs: 1700, source: "ffmpeg-silence" },
      { index: 2, startMs: 8000, endMs: 9250, durationMs: 1250, source: "ffmpeg-silence" }
    ]);
  });

  it("builds speech ranges between silence ranges", () => {
    const speech = buildSpeechRanges({
      silences: [
        { index: 1, startMs: 2000, endMs: 3500, durationMs: 1500, source: "ffmpeg-silence" },
        { index: 2, startMs: 7000, endMs: 8500, durationMs: 1500, source: "ffmpeg-silence" }
      ],
      durationMs: 12000,
      minClipMs: 1000
    });

    expect(speech).toEqual([
      { index: 1, startMs: 0, endMs: 2000, durationMs: 2000, source: "ffmpeg-speech" },
      { index: 2, startMs: 3500, endMs: 7000, durationMs: 3500, source: "ffmpeg-speech" },
      { index: 3, startMs: 8500, endMs: 12000, durationMs: 3500, source: "ffmpeg-speech" }
    ]);
  });
});
