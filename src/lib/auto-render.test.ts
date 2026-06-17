import { describe, expect, it } from "vitest";
import { clipsFromMaterialAnalysis } from "./auto-render";

describe("clipsFromMaterialAnalysis", () => {
  it("maps material-analysis candidates to render clips", () => {
    const clips = clipsFromMaterialAnalysis({
      schema: "ai-video-assistant.material-analysis.v1",
      media: {
        primaryVideoPath: "workspace/input/references/sample.mp4"
      },
      candidates: [
        {
          id: "fallback-1",
          startMs: 0,
          endMs: 4000,
          reason: "First candidate",
          source: "fallback"
        },
        {
          id: "scene-1",
          startMs: 5000,
          endMs: 9000,
          reason: "Scene candidate",
          source: "scene"
        }
      ]
    });

    expect(clips).toEqual([
      {
        inputPath: "workspace/input/references/sample.mp4",
        startMs: 0,
        endMs: 4000,
        label: "fallback-1: fallback"
      },
      {
        inputPath: "workspace/input/references/sample.mp4",
        startMs: 5000,
        endMs: 9000,
        label: "scene-1: scene"
      }
    ]);
  });

  it("rejects analysis without a primary video", () => {
    expect(() => clipsFromMaterialAnalysis({
      schema: "ai-video-assistant.material-analysis.v1",
      media: {},
      candidates: [
        {
          id: "fallback-1",
          startMs: 0,
          endMs: 4000,
          reason: "First candidate",
          source: "fallback"
        }
      ]
    })).toThrow(/primary video path/i);
  });
});
