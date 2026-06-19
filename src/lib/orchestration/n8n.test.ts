import { describe, expect, it, vi } from "vitest";
import {
  buildN8nImportableWorkflow,
  buildN8nWorkflowBlueprint,
  buildN8nWorkflowPayload,
  exportN8nWorkflowFile,
  N8N_CONFIRM_TEXT,
  N8N_HTTP_MAX_TRIES,
  N8N_HTTP_WAIT_BETWEEN_TRIES_MS,
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

  it("builds an importable n8n workflow scaffold without credentials", () => {
    const workflow = buildN8nImportableWorkflow(
      { topic: "AI video topic", platform: "douyin", category: "tech" },
      {
        APP_BASE_URL: "http://127.0.0.1:5182",
        N8N_WEBHOOK_SECRET: "do-not-include"
      }
    );

    expect(workflow.nodes.map((node) => node.type)).toEqual(expect.arrayContaining([
      "n8n-nodes-base.scheduleTrigger",
      "n8n-nodes-base.webhook",
      "n8n-nodes-base.httpRequest",
      "n8n-nodes-base.stickyNote"
    ]));
    expect(workflow.connections["01 Trend report"].main[0][0].node).toBe("02 Generate script");
    expect(workflow.nodes.find((node) => node.name === "05 Dispatch approved draft")?.disabled).toBe(true);
    expect(workflow.nodes.find((node) => node.name === "Approval id mapping")?.type).toBe("n8n-nodes-base.stickyNote");
    expect(JSON.stringify(workflow)).not.toContain("do-not-include");
  });

  it("adds retry policy to importable HTTP nodes and keeps dispatch gated by an approved queue id", () => {
    const workflow = buildN8nImportableWorkflow(
      { topic: "AI video topic", platform: "douyin", category: "tech" },
      { APP_BASE_URL: "http://127.0.0.1:5182" }
    );
    const httpNodes = workflow.nodes.filter((node) => node.type === "n8n-nodes-base.httpRequest");
    expect(httpNodes.length).toBeGreaterThanOrEqual(6);
    expect(httpNodes.every((node) => node.retryOnFail === true)).toBe(true);
    expect(httpNodes.every((node) => node.maxTries === N8N_HTTP_MAX_TRIES)).toBe(true);
    expect(httpNodes.every((node) => node.waitBetweenTries === N8N_HTTP_WAIT_BETWEEN_TRIES_MS)).toBe(true);

    const dispatch = workflow.nodes.find((node) => node.name === "05 Dispatch approved draft");
    expect(dispatch?.disabled).toBe(true);
    expect(JSON.parse(dispatch?.parameters.jsonBody as string).id).toBe("REPLACE_WITH_APPROVED_QUEUE_ITEM_ID");
    expect(dispatch?.notes).toContain("approved queue item id");
  });

  it("wires an explicit queue item id into exported dispatch payloads", () => {
    const workflow = buildN8nImportableWorkflow(
      { topic: "AI video topic", platform: "douyin", queueItemId: "queue-approved-123" },
      { APP_BASE_URL: "http://127.0.0.1:5182" }
    );
    const dispatch = workflow.nodes.find((node) => node.name === "05 Dispatch approved draft");
    expect(JSON.parse(dispatch?.parameters.jsonBody as string).id).toBe("queue-approved-123");
    expect(dispatch?.notes).toContain("includes a queueItemId");
    expect(JSON.stringify(workflow.nodes.find((node) => node.name === "Human approval required"))).toContain("queue-approved-123");
  });

  it("exports the n8n workflow scaffold to drafts", async () => {
    const result = await exportN8nWorkflowFile(
      { topic: "AI video topic", platform: "bilibili", category: "tech" },
      {
        env: { APP_BASE_URL: "http://127.0.0.1:5182" },
        now: () => new Date("2026-06-18T00:00:00.000Z")
      }
    );

    expect(result.workflowPath).toBe("workspace/drafts/n8n-workflow-bilibili-2026-06-18T00-00-00-000Z.json");
    expect(result.workflow.nodes.length).toBeGreaterThanOrEqual(9);
    expect(result.importNotes.join("\n")).toContain("No credentials");
    expect(result.importNotes.join("\n")).toContain("retryOnFail");
  });
});
