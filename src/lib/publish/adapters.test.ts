import { describe, expect, it } from "vitest";
import { getPublishAdapterStatus, listPublishAdapterStatus } from "@/lib/publish/adapters";

describe("publish adapter status", () => {
  it("keeps platforms dry-run only even when credentials exist", () => {
    const status = getPublishAdapterStatus("douyin", { SOCIAL_AUTO_UPLOAD_SESSION_DIR: "A:/sessions" });
    expect(status.configured).toBe(true);
    expect(status.adapter).toBe("social-auto-upload");
    expect(status.canPublish).toBe(false);
    expect(status.dryRunOnly).toBe(true);
    expect(status.manualConfirmRequired).toBe(true);
  });

  it("falls back to manual when no adapter env is configured", () => {
    const status = getPublishAdapterStatus("kuaishou", {});
    expect(status.configured).toBe(false);
    expect(status.adapter).toBe("manual");
    expect(status.hints[0]).toContain("手动发布");
  });

  it("never routes a domestic platform to postiz (Postiz 不支持国内平台)", () => {
    // 回归:此前把 douyin/kuaishou/bilibili 映射到 postiz,但 Postiz 只支持海外平台,
    // 国内平台永远连不上,等于给用户一个假选项。
    for (const platform of ["douyin", "kuaishou", "bilibili"] as const) {
      const status = getPublishAdapterStatus(platform, {
        POSTIZ_URL: "http://localhost:5000/api",
        POSTIZ_API_KEY: "key"
      });
      expect(status.adapter).not.toBe("postiz");
    }
  });

  it("lists all supported platforms", () => {
    expect(listPublishAdapterStatus({}).map((item) => item.platform).sort()).toEqual(["bilibili", "douyin", "kuaishou"]);
  });
});
