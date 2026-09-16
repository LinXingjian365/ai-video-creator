import { describe, expect, it } from "vitest";
import { buildReframeFilter, platformVariantTargets } from "./platform-variants";

describe("platformVariantTargets", () => {
  it("builds default platform targets", () => {
    const targets = platformVariantTargets([], "crop");
    expect(targets.map((target) => `${target.id}:${target.width}x${target.height}:${target.mode}`)).toEqual([
      "douyin:1080x1920:crop",
      "kuaishou:1080x1920:crop",
      "bilibili:1920x1080:crop",
      "square:1080x1080:crop"
    ]);
  });

  it("builds selected fit targets", () => {
    const targets = platformVariantTargets(["bilibili", "square"], "fit");
    expect(targets).toMatchObject([
      { id: "bilibili", width: 1920, height: 1080, mode: "fit" },
      { id: "square", width: 1080, height: 1080, mode: "fit" }
    ]);
  });
});

describe("buildReframeFilter", () => {
  it("uses crop mode for immersive vertical output", () => {
    expect(buildReframeFilter({ width: 1080, height: 1920, mode: "crop" })).toBe(
      "scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,setsar=1"
    );
  });

  it("uses fit mode with padding", () => {
    expect(buildReframeFilter({ width: 1920, height: 1080, mode: "fit" })).toBe(
      "scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2,setsar=1"
    );
  });
});
