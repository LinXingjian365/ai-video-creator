import { describe, expect, it } from "vitest";
import { buildSmokeWorkflow } from "./n8n-smoke-test.mjs";

describe("n8n smoke workflow builder", () => {
  it("keeps the default status smoke small and side-effect free", () => {
    const workflow = buildSmokeWorkflow({
      mode: "status",
      baseUrl: "http://app.local",
      name: "status smoke"
    });

    expect(workflow.name).toBe("status smoke");
    expect(workflow.nodes.map((node) => node.name)).toEqual([
      "Manual smoke trigger",
      "Call local app n8n status"
    ]);
    expect(workflow.nodes[1].parameters).toMatchObject({
      method: "GET",
      url: "http://app.local/api/orchestration/n8n"
    });
  });

  it("builds an orchestration smoke that walks real local read endpoints before dry-run orchestration", () => {
    const workflow = buildSmokeWorkflow({
      mode: "orchestration",
      baseUrl: "http://app.local",
      name: "orchestration smoke"
    });

    expect(workflow.name).toBe("orchestration smoke");
    expect(workflow.nodes.map((node) => node.name)).toEqual([
      "Manual orchestration smoke trigger",
      "01 n8n blueprint status",
      "02 Creator readiness",
      "03 Workspace assets",
      "04 Build n8n dry-run payload"
    ]);
    expect(workflow.connections["03 Workspace assets"].main[0][0].node).toBe("04 Build n8n dry-run payload");
    expect(workflow.nodes[1].parameters.url).toBe("http://app.local/api/orchestration/n8n");

    const postNode = workflow.nodes.find((node) => node.name === "04 Build n8n dry-run payload");
    expect(postNode.parameters).toMatchObject({
      method: "POST",
      url: "http://app.local/api/orchestration/n8n",
      sendHeaders: true,
      sendBody: true
    });
    const payload = JSON.parse(postNode.parameters.jsonBody);
    expect(payload).toMatchObject({
      topic: "n8n smoke 全链路编排",
      platform: "douyin",
      mode: "dry-run",
      exportWorkflow: false
    });
    expect(JSON.stringify(workflow)).not.toContain("sk-");
  });
});
