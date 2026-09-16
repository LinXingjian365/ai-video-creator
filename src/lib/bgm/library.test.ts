import { describe, expect, it } from "vitest";
import { deriveMoodKeywords, pickBgm, scoreEntry, tagsFromPath, type BgmEntry } from "./library";

function entry(relativePath: string): BgmEntry {
  const fileName = relativePath.split("/").pop() ?? relativePath;
  return { relativePath, fileName, moodTags: tagsFromPath(relativePath) };
}

const library: BgmEntry[] = [
  entry("workspace/input/audio/uplifting/sora-upbeat-electronic.mp3"),
  entry("workspace/input/audio/uplifting/pixabay-tech-future.mp3"),
  entry("workspace/input/audio/calm/freepd-piano-ambient.mp3"),
  entry("workspace/input/audio/cinematic/epic-orchestral-rise.wav"),
  entry("workspace/input/audio/dark/tense-suspense-1.mp3"),
  entry("workspace/input/audio/_misc/random-jingle.m4a")
];

describe("deriveMoodKeywords", () => {
  it("maps Chinese mood phrases to canonical keywords", () => {
    const k = deriveMoodKeywords("轻快电子节奏卡点在3s处");
    expect(k).toContain("uplifting");
    expect(k).toContain("tech");
  });

  it("maps English synonyms to canonicals", () => {
    expect(deriveMoodKeywords("upbeat happy energetic")).toContain("uplifting");
    expect(deriveMoodKeywords("dark suspense thriller")).toContain("dark");
  });

  it("returns empty canonical hits for unmatched but keeps raw tokens", () => {
    const k = deriveMoodKeywords("国风 city-pop");
    // 没有同义词匹配到 canonical,但原 token 会被保留以支持自定义曲风
    expect(k.some((token) => token.includes("国风") || token.includes("city-pop"))).toBe(true);
  });
});

describe("tagsFromPath", () => {
  it("extracts canonical mood tag from folder name", () => {
    expect(tagsFromPath("uplifting/foo-bar.mp3")).toContain("uplifting");
  });

  it("normalizes folder synonyms (upbeat → uplifting)", () => {
    expect(tagsFromPath("upbeat/track.mp3")).toContain("uplifting");
  });

  it("extracts tokens from filename without numeric noise, normalizing synonyms", () => {
    const tags = tagsFromPath("uplifting/sora-upbeat-electronic-128.mp3");
    expect(tags).toContain("uplifting"); // upbeat → uplifting canonical
    expect(tags).toContain("tech");      // electronic → tech canonical
    expect(tags).toContain("sora");      // unrecognized token kept verbatim
    expect(tags.find((t) => t === "128")).toBeUndefined();
  });
});

describe("scoreEntry", () => {
  it("counts matched canonical keywords", () => {
    const result = scoreEntry(library[0], ["uplifting", "tech"]);
    expect(result.score).toBe(2);
    expect(result.matched.sort()).toEqual(["tech", "uplifting"]);
  });

  it("returns 0 for empty keyword set", () => {
    expect(scoreEntry(library[0], []).score).toBe(0);
  });

  it("returns 0 for entry with no tags", () => {
    expect(scoreEntry({ relativePath: "x.mp3", fileName: "x.mp3", moodTags: [] }, ["uplifting"]).score).toBe(0);
  });
});

describe("pickBgm", () => {
  it("picks the highest-scoring entry for an LLM mood phrase", () => {
    const result = pickBgm(library, "轻快电子节奏卡点在3s处");
    expect(result.pick?.relativePath).toMatch(/uplifting\/(sora|pixabay)/);
    expect(result.score).toBeGreaterThanOrEqual(1);
    expect(result.matchedKeywords).toContain("uplifting");
  });

  it("prefers entry matching both keywords over one", () => {
    // "轻快电子" → uplifting + tech;sora-upbeat-electronic 和 pixabay-tech-future 都有 tech+uplifting tag
    const result = pickBgm(library, "uplifting tech");
    expect(result.score).toBe(2);
    // 同分时按相对路径字典序,pixabay-... 排在 sora-... 前
    expect(result.pick?.fileName).toBe("pixabay-tech-future.mp3");
  });

  it("is deterministic: same input yields same pick", () => {
    const a = pickBgm(library, "calm ambient");
    const b = pickBgm(library, "calm ambient");
    expect(a.pick?.relativePath).toBe(b.pick?.relativePath);
  });

  it("returns null + actionable hint when library is empty", () => {
    const result = pickBgm([], "uplifting tech");
    expect(result.pick).toBeNull();
    expect(result.nextActions[0]).toMatch(/library is empty/i);
  });

  it("returns null when nothing matches and fallback disabled", () => {
    const result = pickBgm(library, "完全不存在的曲风xyzzy");
    expect(result.pick).toBeNull();
    expect(result.score).toBe(0);
    expect(result.nextActions[0]).toMatch(/No BGM matches/i);
  });

  it("falls back to first-by-name when fallbackFirst=true and no match", () => {
    const result = pickBgm(library, "完全不存在的曲风xyzzy", { fallbackFirst: true });
    expect(result.pick).not.toBeNull();
    expect(result.score).toBe(0);
    expect(result.nextActions[0]).toMatch(/fell back/i);
  });

  it("surfaces rankings so caller can show top alternatives", () => {
    const result = pickBgm(library, "uplifting");
    expect(result.rankings.length).toBe(library.length);
    expect(result.rankings[0].score).toBeGreaterThanOrEqual(result.rankings.at(-1)!.score);
  });
});
