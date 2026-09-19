import { describe, expect, it, vi } from "vitest";
import { runPublishPreflight } from "@/lib/publish/preflight";

describe("publish preflight", () => {
  it("treats domestic platforms as manual publish, not blocked by missing Postiz", async () => {
    // 回归:此前把 POSTIZ_API_KEY / POSTIZ_INTEGRATION_ID_DOUYIN 缺失当成 blocker,
    // 但 Postiz 不支持国内平台,这些缺失根本不该阻塞国内平台的手动发布。
    const report = await runPublishPreflight(
      { platforms: ["douyin"], probePostiz: true },
      { env: {}, now: () => new Date("2026-06-18T00:00:00.000Z") }
    );

    expect(report.checkedAt).toBe("2026-06-18T00:00:00.000Z");
    expect(report.postiz.probeStatus).toBe("skipped");
    expect(report.postiz.hasApiKey).toBe(false);
    expect(report.blockers).toEqual([]);
    expect(report.nextActions.some((action) => action.includes("手动发布"))).toBe(true);
    expect(report.adapters[0].adapter).toBe("manual");
  });

  it("probes Postiz integrations when explicitly configured (海外平台)", async () => {
    const fetchMock = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) =>
      new Response(JSON.stringify([{ id: "int-1", name: "My TikTok", identifier: "tiktok", profile: "demo" }]), { status: 200 })
    );
    const report = await runPublishPreflight(
      { platforms: ["douyin"], probePostiz: true },
      {
        env: {
          POSTIZ_URL: "https://postiz.example.com",
          POSTIZ_API_KEY: "secret-key"
        },
        fetch: fetchMock as never
      }
    );

    expect(report.postiz.probeStatus).toBe("ok");
    expect(report.postiz.endpoint).toBe("https://postiz.example.com/public/v1/integrations");
    expect(report.postiz.integrations[0]).toMatchObject({ id: "int-1", identifier: "tiktok" });
    expect(JSON.stringify(report)).not.toContain("secret-key");
    expect(fetchMock).toHaveBeenCalledWith("https://postiz.example.com/public/v1/integrations", {
      headers: { Authorization: "secret-key" }
    });
  });

  it("keeps failed Postiz probes as report blockers", async () => {
    const fetchMock = vi.fn(async () => new Response("bad key", { status: 401 }));
    const report = await runPublishPreflight(
      { platforms: ["bilibili"], probePostiz: true },
      {
        env: {
          POSTIZ_URL: "https://postiz.example.com/public/v1",
          POSTIZ_API_KEY: "secret-key"
        },
        fetch: fetchMock as never
      }
    );

    expect(report.postiz.probeStatus).toBe("failed");
    expect(report.blockers[0]).toContain("401");
  });
});
