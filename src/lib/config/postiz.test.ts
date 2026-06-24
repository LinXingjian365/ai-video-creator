import { describe, expect, it, vi } from "vitest";
import { probePostizIntegrations } from "./postiz";

describe("probePostizIntegrations", () => {
  it("reports unconfigured when the API key is missing", async () => {
    const result = await probePostizIntegrations({ POSTIZ_URL: "http://localhost:5000" });

    expect(result.ok).toBe(false);
    expect(result.configured).toBe(false);
    expect(result.integrations).toEqual([]);
    expect(result.detail).toContain("POSTIZ_API_KEY");
  });

  it("parses integrations from common response wrappers and never leaks the key", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      data: {
        integrations: [
          { id: "int_douyin", name: "My Douyin", provider: "tiktok" },
          { _id: "int_bili", title: "B站账号", type: "bilibili" }
        ]
      }
    }), { status: 200 }));

    const result = await probePostizIntegrations(
      {
        POSTIZ_URL: "http://localhost:5000/api",
        POSTIZ_API_KEY: "postiz-secret",
        POSTIZ_INTEGRATION_ID_DOUYIN: "int_douyin"
      },
      { fetch: fetchImpl }
    );

    expect(fetchImpl).toHaveBeenCalledWith("http://localhost:5000/api/public/v1/integrations", expect.objectContaining({
      headers: { Authorization: "postiz-secret" }
    }));
    expect(result.ok).toBe(true);
    expect(result.integrations).toMatchObject([
      { id: "int_douyin", name: "My Douyin", platformHint: "douyin" },
      { id: "int_bili", name: "B站账号", platformHint: "bilibili" }
    ]);
    expect(result.platforms.find((item) => item.platform === "douyin")).toMatchObject({
      configured: true,
      configuredId: "int_douyin",
      candidateIds: ["int_douyin"]
    });
    expect(result.platforms.find((item) => item.platform === "bilibili")?.candidateIds).toEqual(["int_bili"]);
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
