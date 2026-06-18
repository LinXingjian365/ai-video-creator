import { describe, expect, it, vi } from "vitest";
import {
  buildN8nWorkflowBlueprint,
  buildN8nWorkflowPayload,
  N8N_CONFIRM_TEXT,
  triggerN8nOrchestration
} from "@/lib/orchestration/n8n";

describe("n8n orchestration", () => {
  it("builds a full-chain payload without secrets", () => {
    const payload = buildN8nWorkflowPayload(
      {
        topic: "AI video topic",
        platform: "douyin",
        category: "tech",
        references: ["https://example.com/a", " "]
      },
      {
        APP_BASE_URL: "http://127.0.0.1:5182",
        N8N_WEBHOOK_SECRET: "do-not-include",
        PUBLISH_LIVE_ENABLED: "true"
      }
    );

    expect(payload.schema).toBe("ai-video-assistant.n8n-orchestration.v1");
    expect(payload.safety.secretsIncluded).toBe(false);
    expect(JSON.stringify(payload)).not.toContain("do-not-include");
    expect(payload.steps.map((step) => step.id)).toEqual([
      "trend",
      "script",
      "render",
      "publishQueue",
      "dispatch",
      "analytics"
    ]);
    expect(payload.steps[2].endpoint).toBe("http://127.0.0.1:5182/api/full-chain");
  });

  it("returns a dry-run preview without calling the webhook", async () => {
    const fetchMock = vi.fn();
    const result = await triggerN8nOrchestration(
      { topic: "AI video topic", platform: "bilibili", mode: "dry-run" },
      { env: { N8N_WEBHOOK_URL: "https://n8n.example/webhook" }, fetch: fetchMock as never }
    );

    expect(result).toMatchObject({ status: "preview", sent: false });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("blocks webhook mode without manual confirmation", async () => {
    const fetchMock = vi.fn();
    const result = await triggerN8nOrchestration(
      { topic: "AI video topic", platform: "kuaishou", mode: "webhook", manualConfirm: "NO" },
      { env: { N8N_WEBHOOK_URL: "https://n8n.example/webhook" }, fetch: fetchMock as never }
    );

    expect(result).toMatchObject({ status: "blocked", sent: false });
    expect(result.message).toContain(N8N_CONFIRM_TEXT);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("posts to n8n when webhook url and confirmation are configured", async () => {
    const fetchMock = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) =>
      new Response(JSON.stringify({ ok: true }), { status: 200 })
    );

    const result = await triggerN8nOrchestration(
      {
        topic: "AI video topic",
        platform: "douyin",
        mode: "webhook",
        manualConfirm: N8N_CONFIRM_TEXT
      },
      {
        env: {
          N8N_WEBHOOK_URL: "https://n8n.example/webhook",
          N8N_WEBHOOK_SECRET: "secret"
        },
        fetch: fetchMock as never
      }
    );

    expect(result).toMatchObject({ status: "sent", sent: true, response: { ok: true } });
    expect(fetchMock).toHaveBeenCalledWith("https://n8n.example/webhook", expect.objectContaining({ method: "POST" }));
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect((init.headers as Record<string, string>)["X-AI-Video-Secret"]).toBe("secret");
    expect(JSON.parse(init.body as string).safety.secretsIncluded).toBe(false);
  });

  it("builds a reusable n8n workflow blueprint", () => {
    const blueprint = buildN8nWorkflowBlueprint("http://localhost:3000/");
    expect(blueprint.nodes.some((node) => node.type === "manualApproval")).toBe(true);
    expect(blueprint.nodes.map((node) => node.target).filter(Boolean)).toContain("http://localhost:3000/api/publish/dispatch");
  });
});
