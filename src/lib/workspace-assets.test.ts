import { describe, expect, it } from "vitest";
import { classifyWorkspaceAsset } from "./workspace-assets";

describe("classifyWorkspaceAsset", () => {
  it("classifies workflow json files", () => {
    expect(classifyWorkspaceAsset("manifest.json")).toBe("manifest");
    expect(classifyWorkspaceAsset("material-analysis-1781662872895.json")).toBe("material-analysis");
    expect(classifyWorkspaceAsset("demo-1781663696245-jianying-plan.json")).toBe("jianying-plan");
    expect(classifyWorkspaceAsset("demo-auto-plan.json")).toBe("auto-plan");
    expect(classifyWorkspaceAsset("tasks-state.json")).toBe("task-state");
  });

  it("classifies media files by extension", () => {
    expect(classifyWorkspaceAsset("source.MP4")).toBe("video");
    expect(classifyWorkspaceAsset("voice.wav")).toBe("audio");
    expect(classifyWorkspaceAsset("cover.webp")).toBe("image");
    expect(classifyWorkspaceAsset("caption.vtt")).toBe("subtitle");
  });
});
