import { describe, expect, it } from "vitest";
import {
  aspectRatioOf,
  buildPublishChecks,
  publishSpecs,
  type PublishProbe
} from "@/lib/publish/dry-run";

const okProbe: PublishProbe = { exists: true, hasVideo: true, width: 1080, height: 1920, durationSec: 45 };

describe("aspectRatioOf", () => {
  it("classifies common aspect ratios", () => {
    expect(aspectRatioOf(1080, 1920)).toBe("9:16");
    expect(aspectRatioOf(1920, 1080)).toBe("16:9");
    expect(aspectRatioOf(1080, 1080)).toBe("1:1");
    expect(aspectRatioOf(0, 0)).toBe("other");
  });
});

describe("publishSpecs", () => {
  it("defines specs for the three platforms", () => {
    expect(publishSpecs.douyin.preferredAspect).toBe("9:16");
    expect(publishSpecs.bilibili.preferredAspect).toBe("16:9");
    expect(publishSpecs.kuaishou.preferredAspect).toBe("9:16");
  });
});

describe("buildPublishChecks", () => {
  it("passes a well-formed douyin post", () => {
    const checks = buildPublishChecks(
      { platform: "douyin", videoPath: "a.mp4", title: "三个剪映隐藏功能", tags: ["剪辑", "教程"] },
      okProbe
    );
    expect(checks.some((c) => c.status === "fail")).toBe(false);
  });

  it("fails when the file is missing", () => {
    const checks = buildPublishChecks(
      { platform: "douyin", videoPath: "missing.mp4", title: "标题" },
      { exists: false, hasVideo: false, width: 0, height: 0, durationSec: 0 }
    );
    expect(checks.find((c) => c.label.includes("文件"))?.status).toBe("fail");
  });

  it("fails on empty or over-long title", () => {
    const empty = buildPublishChecks({ platform: "douyin", videoPath: "a.mp4", title: "  " }, okProbe);
    expect(empty.find((c) => c.label.includes("标题"))?.status).toBe("fail");

    const longTitle = "标".repeat(publishSpecs.douyin.titleMax + 1);
    const over = buildPublishChecks({ platform: "douyin", videoPath: "a.mp4", title: longTitle }, okProbe);
    expect(over.find((c) => c.label.includes("标题"))?.status).toBe("fail");
  });

  it("warns (not fails) on aspect ratio mismatch", () => {
    const checks = buildPublishChecks(
      { platform: "bilibili", videoPath: "a.mp4", title: "横屏内容" },
      okProbe // 9:16 fed to bilibili which prefers 16:9
    );
    const aspect = checks.find((c) => c.label.includes("画幅"));
    expect(aspect?.status).toBe("warn");
    expect(checks.some((c) => c.status === "fail")).toBe(false);
  });

  it("warns when tag count exceeds the platform limit", () => {
    const tags = Array.from({ length: publishSpecs.douyin.tagMax + 2 }, (_, i) => `tag${i}`);
    const checks = buildPublishChecks({ platform: "douyin", videoPath: "a.mp4", title: "标题", tags }, okProbe);
    expect(checks.find((c) => c.label.includes("标签"))?.status).toBe("warn");
  });
});
