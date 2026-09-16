import { describe, expect, it, vi } from "vitest";
import { runEvidenceSearch } from "./evidence";

const FROZEN = new Date("2026-06-18T00:00:00Z");

describe("runEvidenceSearch", () => {
  it("auto-selects Exa when EXA_API_KEY is set and normalizes results", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({
        results: [
          {
            title: "AI 视频剪辑工具对比 2026",
            url: "https://example.com/ai-video-2026",
            text: "  Sora、Runway 与 Pika    的横评:质量、价格、可控性 \n 三方面打分。",
            publishedDate: "2026-05-12T10:00:00Z",
            author: "Editor"
          }
        ]
      }))
    );

    const report = await runEvidenceSearch(
      { query: "AI 视频生成工具", limit: 3 },
      {
        env: { EXA_API_KEY: "exa-token" },
        fetch: fetchMock as unknown as typeof fetch,
        now: () => FROZEN
      }
    );

    expect(report.provider).toBe("exa");
    expect(report.query).toBe("AI 视频生成工具");
    expect(report.results).toHaveLength(1);
    expect(report.results[0]).toMatchObject({
      title: "AI 视频剪辑工具对比 2026",
      url: "https://example.com/ai-video-2026",
      provider: "exa",
      author: "Editor"
    });
    // 空白折叠 + 截断
    expect(report.results[0].snippet).toBe("Sora、Runway 与 Pika 的横评:质量、价格、可控性 三方面打分。");
    expect(report.results[0].publishedAt).toBe("2026-05-12T10:00:00.000Z");
    expect(report.nextActions.length).toBeGreaterThan(0);

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(String(url)).toBe("https://api.exa.ai/search");
    expect((init.headers as Record<string, string>)["x-api-key"]).toBe("exa-token");
    expect(init.method).toBe("POST");
    const body = JSON.parse(init.body as string);
    expect(body.query).toBe("AI 视频生成工具");
    expect(body.numResults).toBe(3);
    expect(body.contents).toBeDefined();
  });

  it("falls back to Firecrawl when only FIRECRAWL_API_KEY is set", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({
        data: [
          { title: "剪映 2026 新功能", url: "https://news.example.com/jianying", description: "节拍跳剪、AI 配音、字幕一键烧录。" }
        ]
      }))
    );

    const report = await runEvidenceSearch(
      { query: "剪映 新功能" },
      {
        env: { FIRECRAWL_API_KEY: "fc-token" },
        fetch: fetchMock as unknown as typeof fetch,
        now: () => FROZEN
      }
    );

    expect(report.provider).toBe("firecrawl");
    expect(report.results[0]).toMatchObject({
      title: "剪映 2026 新功能",
      url: "https://news.example.com/jianying",
      provider: "firecrawl"
    });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(String(url)).toBe("https://api.firecrawl.dev/v1/search");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer fc-token");
  });

  it("honestly throws when no provider key is configured", async () => {
    await expect(
      runEvidenceSearch({ query: "anything" }, { env: {}, fetch: vi.fn() as unknown as typeof fetch, now: () => FROZEN })
    ).rejects.toThrow(/EXA_API_KEY or FIRECRAWL_API_KEY/);
  });

  it("rejects explicit provider when its key is missing", async () => {
    await expect(
      runEvidenceSearch(
        { query: "topic", provider: "exa" },
        { env: { FIRECRAWL_API_KEY: "fc" }, fetch: vi.fn() as unknown as typeof fetch, now: () => FROZEN }
      )
    ).rejects.toThrow(/provider=exa requires EXA_API_KEY/);
  });

  it("rejects empty query", async () => {
    await expect(
      runEvidenceSearch({ query: "   " }, { env: { EXA_API_KEY: "x" }, fetch: vi.fn() as unknown as typeof fetch, now: () => FROZEN })
    ).rejects.toThrow(/non-empty query/);
  });

  it("returns a graceful nextAction when results are empty", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ results: [] })));
    const report = await runEvidenceSearch(
      { query: "obscure topic", provider: "exa" },
      { env: { EXA_API_KEY: "exa" }, fetch: fetchMock as unknown as typeof fetch, now: () => FROZEN }
    );
    expect(report.results).toEqual([]);
    expect(report.nextActions[0]).toMatch(/no evidence/i);
  });

  it("surfaces upstream HTTP errors verbatim", async () => {
    const fetchMock = vi.fn(async () => new Response("rate limited", { status: 429 }));
    await expect(
      runEvidenceSearch(
        { query: "x", provider: "firecrawl" },
        { env: { FIRECRAWL_API_KEY: "fc" }, fetch: fetchMock as unknown as typeof fetch, now: () => FROZEN }
      )
    ).rejects.toThrow(/Firecrawl evidence search HTTP 429: rate limited/);
  });
});
