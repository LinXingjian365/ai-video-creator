import { describe, expect, it } from "vitest";
import { runSelfCheck, type SelfCheckItem } from "./self-check";

function makeFetch(opts: { default?: number | "throw"; routes?: Record<string, number | "throw"> }): typeof fetch {
  const def = opts.default ?? "throw";
  const routes = opts.routes ?? {};
  return (async (url: string) => {
    for (const [frag, val] of Object.entries(routes)) {
      if (url.includes(frag)) {
        if (val === "throw") throw new Error("ECONNREFUSED");
        return new Response("", { status: val });
      }
    }
    if (def === "throw") throw new Error("ECONNREFUSED");
    return new Response("", { status: def });
  }) as unknown as typeof fetch;
}

const noBinaries = () => [] as SelfCheckItem[];
const now = () => new Date("2026-06-19T00:00:00.000Z");

function byId(items: SelfCheckItem[], id: string): SelfCheckItem {
  const found = items.find((i) => i.id === id);
  if (!found) throw new Error(`item ${id} not found`);
  return found;
}

describe("runSelfCheck", () => {
  it("reports ok when everything is wired, reachable and present", async () => {
    const report = await runSelfCheck({
      env: {
        TTD_ENABLED: "true",
        TTD_BASE_URL: "http://127.0.0.1:5555",
        N8N_WEBHOOK_URL: "http://localhost:5678/webhook/ai-video-full-chain",
        POSTIZ_URL: "http://localhost:5000/api",
        POSTIZ_API_KEY: "key123",
        KSD_ENABLED: "true",
        DEEPSEEK_API_KEY: "sk-test"
      },
      fetch: makeFetch({
        routes: {
          "/docs": 200,
          "/healthz": 200,
          "/integrations": 200,
          ":5557/": 404 // KSD reachable (any response counts)
        }
      }),
      bgmCount: async () => 7,
      binaryProbes: noBinaries,
      now
    });

    expect(byId(report.items, "ttd").status).toBe("ok");
    expect(byId(report.items, "n8n").status).toBe("ok");
    expect(byId(report.items, "postiz").status).toBe("ok");
    expect(byId(report.items, "ksd").status).toBe("ok");
    expect(byId(report.items, "llm").status).toBe("ok");
    expect(byId(report.items, "bgm").status).toBe("ok");
    expect(report.summary.ok).toBe(6);
    expect(report.checkedAt).toBe("2026-06-19T00:00:00.000Z");
  });

  it("reports unconfigured when nothing is set and nothing is reachable", async () => {
    const report = await runSelfCheck({
      env: {},
      fetch: makeFetch({ default: "throw" }),
      bgmCount: async () => 0,
      binaryProbes: noBinaries,
      now
    });

    expect(byId(report.items, "ttd").status).toBe("unconfigured");
    expect(byId(report.items, "n8n").status).toBe("unconfigured");
    expect(byId(report.items, "postiz").status).toBe("unconfigured");
    expect(byId(report.items, "ksd").status).toBe("unconfigured");
    expect(byId(report.items, "llm").status).toBe("unconfigured");
    expect(byId(report.items, "bgm").status).toBe("unconfigured");
    expect(report.summary.unconfigured).toBe(6);
  });

  it("reports degraded when service is reachable but app is not wired", async () => {
    const report = await runSelfCheck({
      env: {}, // nothing wired
      fetch: makeFetch({ default: 200 }), // everything reachable
      bgmCount: async () => 0,
      binaryProbes: noBinaries,
      now
    });

    expect(byId(report.items, "ttd").status).toBe("degraded");
    expect(byId(report.items, "n8n").status).toBe("degraded");
    expect(byId(report.items, "postiz").status).toBe("degraded"); // reachable, no api key
    expect(byId(report.items, "ksd").status).toBe("degraded");
  });

  it("reports down when wired but service probe fails", async () => {
    const report = await runSelfCheck({
      env: {
        TTD_ENABLED: "true",
        N8N_WEBHOOK_URL: "http://localhost:5678/webhook/x",
        POSTIZ_URL: "http://localhost:5000/api",
        POSTIZ_API_KEY: "key123",
        KSD_ENABLED: "true"
      },
      fetch: makeFetch({ default: "throw" }),
      bgmCount: async () => 0,
      binaryProbes: noBinaries,
      now
    });

    expect(byId(report.items, "ttd").status).toBe("down");
    expect(byId(report.items, "n8n").status).toBe("down");
    expect(byId(report.items, "postiz").status).toBe("down");
    expect(byId(report.items, "ksd").status).toBe("down");
  });

  it("Postiz is degraded when api key present but integrations returns non-200", async () => {
    const report = await runSelfCheck({
      env: { POSTIZ_URL: "http://localhost:5000/api", POSTIZ_API_KEY: "stale" },
      fetch: makeFetch({ routes: { "/integrations": 401 } }),
      bgmCount: async () => 0,
      binaryProbes: noBinaries,
      now
    });
    expect(byId(report.items, "postiz").status).toBe("degraded");
    expect(byId(report.items, "postiz").detail).toContain("401");
  });

  it("BGM is down when scan throws", async () => {
    const report = await runSelfCheck({
      env: {},
      fetch: makeFetch({ default: "throw" }),
      bgmCount: async () => {
        throw new Error("disk error");
      },
      binaryProbes: noBinaries,
      now
    });
    expect(byId(report.items, "bgm").status).toBe("down");
  });

  it("includes injected binary probes and counts them in summary", async () => {
    const report = await runSelfCheck({
      env: {},
      fetch: makeFetch({ default: "throw" }),
      bgmCount: async () => 0,
      binaryProbes: () => [
        { id: "ffmpeg", label: "FFmpeg", category: "capability", status: "ok", detail: "v6" },
        { id: "yt-dlp", label: "yt-dlp", category: "capability", status: "down", detail: "missing" }
      ],
      now
    });
    expect(report.items).toHaveLength(8);
    expect(byId(report.items, "ffmpeg").status).toBe("ok");
    expect(byId(report.items, "yt-dlp").status).toBe("down");
    expect(report.summary.total).toBe(8);
    expect(report.summary.ok).toBe(1); // only ffmpeg
    expect(report.summary.down).toBe(1); // yt-dlp
  });
});
