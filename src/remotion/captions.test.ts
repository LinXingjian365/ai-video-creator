import { describe, expect, it } from "vitest";
import {
  activeCueIndex,
  buildCaptionCues,
  chunkCaptionCues,
  cuesFromTimings,
  parseBeatTime,
  splitTextIntoChunks
} from "@/remotion/captions";

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

describe("cuesFromTimings", () => {
  it("converts real subtitle seconds to frame windows at the given fps", () => {
    const cues = cuesFromTimings(
      [
        { text: "第一句", startSec: 0.1, endSec: 3.162 },
        { text: "第二句", startSec: 3.112, endSec: 6.187 }
      ],
      300,
      30
    );
    expect(cues[0]).toEqual({ index: 0, caption: "第一句", fromFrame: 3, toFrame: 95 });
    expect(cues[1]).toEqual({ index: 1, caption: "第二句", fromFrame: 93, toFrame: 186 });
  });

  it("clamps to total frames and drops empty text", () => {
    const cues = cuesFromTimings(
      [
        { text: " ", startSec: 0, endSec: 1 },
        { text: "尾句", startSec: 9, endSec: 99 }
      ],
      300,
      30
    );
    expect(cues).toEqual([{ index: 0, caption: "尾句", fromFrame: 270, toFrame: 300 }]);
  });
});

describe("splitTextIntoChunks", () => {
  it("keeps short text as a single chunk", () => {
    expect(splitTextIntoChunks("短句子。", 18)).toEqual(["短句子。"]);
  });

  it("packs punctuation-delimited pieces up to maxChars", () => {
    expect(splitTextIntoChunks("一二三，四五六，七八九。", 8)).toEqual(["一二三，四五六，", "七八九。"]);
  });

  it("hard-splits an overlong unpunctuated piece", () => {
    expect(splitTextIntoChunks("一二三四五六七八九十", 4)).toEqual(["一二三四", "五六七八", "九十"]);
  });
});

describe("chunkCaptionCues", () => {
  it("splits a long cue across its window by character proportion", () => {
    const cues = chunkCaptionCues(
      [{ index: 0, caption: "一二三，四五六，七八九。", fromFrame: 0, toFrame: 120 }],
      8
    );
    expect(cues).toEqual([
      { index: 0, caption: "一二三，四五六，", fromFrame: 0, toFrame: 80 },
      { index: 1, caption: "七八九。", fromFrame: 80, toFrame: 120 }
    ]);
  });

  it("leaves short cues untouched but reindexes", () => {
    const cues = chunkCaptionCues(
      [
        { index: 0, caption: "短一", fromFrame: 0, toFrame: 30 },
        { index: 1, caption: "短二", fromFrame: 30, toFrame: 60 }
      ],
      18
    );
    expect(cues).toEqual([
      { index: 0, caption: "短一", fromFrame: 0, toFrame: 30 },
      { index: 1, caption: "短二", fromFrame: 30, toFrame: 60 }
    ]);
  });
});
