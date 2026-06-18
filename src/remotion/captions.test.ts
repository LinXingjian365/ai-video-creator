import { describe, expect, it } from "vitest";
import { activeCueIndex, buildCaptionCues, parseBeatTime } from "@/remotion/captions";

describe("parseBeatTime", () => {
  it("parses second ranges like 0-3s / 3-18s", () => {
    expect(parseBeatTime("0-3s")).toEqual({ start: 0, end: 3 });
    expect(parseBeatTime("3-18s")).toEqual({ start: 3, end: 18 });
  });

  it("parses mm:ss ranges", () => {
    expect(parseBeatTime("0:03-0:18")).toEqual({ start: 3, end: 18 });
    expect(parseBeatTime("1:00-1:30")).toEqual({ start: 60, end: 90 });
  });

  it("returns null for unparseable or inverted ranges", () => {
    expect(parseBeatTime(undefined)).toBeNull();
    expect(parseBeatTime("forever")).toBeNull();
    expect(parseBeatTime("5-5s")).toBeNull();
    expect(parseBeatTime("10-3s")).toBeNull();
  });
});

describe("buildCaptionCues", () => {
  it("weights windows by parsed time spans, scaled to actual duration", () => {
    // spans 3 / 15 / 17 (total 35) scaled onto 350 frames -> 30 / 150 / 170
    const cues = buildCaptionCues(
      [
        { time: "0-3s", caption: "钩子" },
        { time: "3-18s", caption: "讲解" },
        { time: "18-35s", caption: "行动" }
      ],
      350
    );
    expect(cues.map((c) => c.caption)).toEqual(["钩子", "讲解", "行动"]);
    expect(cues[0].fromFrame).toBe(0);
    expect(cues[0].toFrame).toBe(30);
    expect(cues[1].fromFrame).toBe(30);
    expect(cues[1].toFrame).toBe(180);
    // last cue always ends exactly at total
    expect(cues[2].toFrame).toBe(350);
  });

  it("falls back to equal split when any time is unparseable", () => {
    const cues = buildCaptionCues(
      [{ caption: "a" }, { caption: "b", time: "weird" }, { caption: "c" }],
      300
    );
    expect(cues[0].toFrame).toBe(100);
    expect(cues[1].fromFrame).toBe(100);
    expect(cues[1].toFrame).toBe(200);
    expect(cues[2].toFrame).toBe(300);
  });

  it("falls back caption text to voiceover then shot", () => {
    const cues = buildCaptionCues([{ voiceover: "口播", shot: "画面" }, { shot: "只有画面" }], 60);
    expect(cues[0].caption).toBe("口播");
    expect(cues[1].caption).toBe("只有画面");
  });

  it("returns empty for no beats", () => {
    expect(buildCaptionCues([], 300)).toEqual([]);
  });
});

describe("activeCueIndex", () => {
  const cues = buildCaptionCues([{ time: "0-3s" }, { time: "3-6s" }], 180);

  it("finds the cue covering the frame", () => {
    expect(activeCueIndex(cues, 0)).toBe(0);
    expect(activeCueIndex(cues, 89)).toBe(0);
    expect(activeCueIndex(cues, 90)).toBe(1);
    expect(activeCueIndex(cues, 179)).toBe(1);
  });

  it("clamps before first and after last", () => {
    expect(activeCueIndex(cues, -10)).toBe(0);
    expect(activeCueIndex(cues, 9999)).toBe(1);
    expect(activeCueIndex([], 5)).toBe(-1);
  });
});
