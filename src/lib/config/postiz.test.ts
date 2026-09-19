import { describe, expect, it, vi } from "vitest";
import { inferPostizPlatformHint, probePostizIntegrations } from "./postiz";

describe("probePostizIntegrations", () => {
  it("reports unconfigured when the API key is missing", async () => {
    const result = await probePostizIntegrations({ POSTIZ_URL: "http://localhost:5000" });

    expect(result.ok).toBe(false);
    expect(result.configured).toBe(false);
    expect(result.integrations).toEqual([]);
    expect(result.detail).toContain("POSTIZ_API_KEY");
  });

  it("parses overseas integrations and never leaks the key", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      data: {
        integrations: [
          { id: "int_tiktok", name: "My TikTok", provider: "tiktok" },
          { _id: "int_yt", title: "My YouTube", type: "youtube" }
        ]
      }
    }), { status: 200 }));

    const result = await probePostizIntegrations(
      {
        POSTIZ_URL: "http://localhost:5000/api",
        POSTIZ_API_KEY: "postiz-secret",
        POSTIZ_INTEGRATION_ID_TIKTOK: "int_tiktok"
      },
      { fetch: fetchImpl }
    );

    expect(fetchImpl).toHaveBeenCalledWith("http://localhost:5000/api/public/v1/integrations", expect.objectContaining({
      headers: { Authorization: "postiz-secret" }
    }));
    expect(result.ok).toBe(true);
    expect(result.integrations).toMatchObject([
      { id: "int_tiktok", name: "My TikTok", platformHint: "tiktok" },
      { id: "int_yt", name: "My YouTube", platformHint: "youtube" }
    ]);
    expect(result.platforms.find((item) => item.platform === "tiktok")).toMatchObject({
      configured: true,
      configuredId: "int_tiktok",
      candidateIds: ["int_tiktok"]
    });
    expect(result.platforms.find((item) => item.platform === "youtube")?.candidateIds).toEqual(["int_yt"]);
    expect(JSON.stringify(result)).not.toContain("postiz-secret");
  });

  it("sanitizes upstream failures", async () => {
    const result = await probePostizIntegrations(
      { POSTIZ_URL: "http://localhost:5000", POSTIZ_API_KEY: "postiz-secret" },
      { fetch: vi.fn().mockResolvedValue(new Response("postiz-secret bad token", { status: 401 })) }
    );

    expect(result.ok).toBe(false);
    expect(result.detail).toBe("Postiz integrations 探测失败（HTTP 401）。请检查 API Key 或本地 Postiz 登录状态。");
    expect(JSON.stringify(result)).not.toContain("postiz-secret");
  });
});

describe("inferPostizPlatformHint", () => {
  it("does not mistake domestic platforms for Postiz channels", () => {
    // 回归:此前把 douyin/kuaishou/bilibili 当 Postiz 平台,但 Postiz 根本不支持它们。
    expect(inferPostizPlatformHint("我的抖音账号")).toBe("unknown");
    expect(inferPostizPlatformHint("bilibili uploader")).toBe("unknown");
    expect(inferPostizPlatformHint("kuaishou")).toBe("unknown");
  });

  it("recognizes overseas platforms", () => {
    expect(inferPostizPlatformHint("My TikTok")).toBe("tiktok");
    expect(inferPostizPlatformHint("YouTube channel")).toBe("youtube");
  });
});
