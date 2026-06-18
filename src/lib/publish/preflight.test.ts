import { describe, expect, it, vi } from "vitest";
import { runPublishPreflight } from "@/lib/publish/preflight";

describe("publish preflight", () => {
  it("reports missing publish credentials without failing", async () => {
    const report = await runPublishPreflight(
      { platforms: ["douyin"], probePostiz: true },
      { env: {}, now: () => new Date("2026-06-18T00:00:00.000Z") }
    );

    expect(report.checkedAt).toBe("2026-06-18T00:00:00.000Z");
    expect(report.postiz.probeStatus).toBe("skipped");
    expect(report.postiz.hasApiKey).toBe(false);
    expect(report.blockers).toEqual(expect.arrayContaining([
      "POSTIZ_API_KEY is not configured.",
      "Missing platform integration ids: POSTIZ_INTEGRATION_ID_DOUYIN"
    ]));
    expect(report.nextActions.length).toBeGreaterThan(0);
  });

  it("probes Postiz integrations when configured", async () => {
    const fetchMock = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) =>
      new Response(JSON.stringify([{ id: "int-1", name: "Douyin", identifier: "tiktok", profile: "demo" }]), { status: 200 })
    );
    const report = await runPublishPreflight(
      { platforms: ["douyin"], probePostiz: true },
      {
        env: {
          POSTIZ_URL: "https://postiz.example.com",
          POSTIZ_API_KEY: "secret-key",
          POSTIZ_INTEGRATION_ID_DOUYIN: "int-1"
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
          POSTIZ_API_KEY: "secret-key",
          POSTIZ_INTEGRATION_ID_BILIBILI: "int-bili"
        },
        fetch: fetchMock as never
      }
    );

    expect(report.postiz.probeStatus).toBe("failed");
    expect(report.blockers[0]).toContain("401");
  });
});
