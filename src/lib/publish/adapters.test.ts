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
    expect(status.hints[0]).toContain("配置");
  });

  it("lists all supported platforms", () => {
    expect(listPublishAdapterStatus({}).map((item) => item.platform).sort()).toEqual(["bilibili", "douyin", "kuaishou"]);
  });
});
