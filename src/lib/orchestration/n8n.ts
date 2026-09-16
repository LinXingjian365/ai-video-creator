import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { draftsRoot, ensureDir } from "@/lib/paths";
import type { PublishPlatform } from "@/lib/publish/dry-run";

export const N8N_CONFIRM_TEXT = "CONFIRM_N8N_WEBHOOK";
export const N8N_HTTP_MAX_TRIES = 3;
export const N8N_HTTP_WAIT_BETWEEN_TRIES_MS = 10_000;

export type N8nOrchestrationMode = "dry-run" | "webhook";
export type N8nOrchestrationStatus = "preview" | "sent" | "blocked";
export type N8nWorkflowStage =
  | "trend"
  | "script"
  | "render"
  | "publishQueue"
  | "dispatch"
  | "analytics";

export interface N8nOrchestrationInput {
  topic: string;
  platform: PublishPlatform;
  mode?: N8nOrchestrationMode;
  category?: string;
  topN?: number;
  audience?: string;
  durationSec?: number;
  references?: string[];
  videoPath?: string;
  queueItemId?: string;
  analyticsWindow?: "30m" | "24h" | "7d" | "custom";
  manualConfirm?: string;
  exportWorkflow?: boolean;
}

export interface N8nWorkflowStep {
  id: N8nWorkflowStage;
  label: string;
  method: "GET" | "POST";
  endpoint: string;
  requiresHumanApproval: boolean;
  payloadHint: Record<string, unknown>;
}

export interface N8nWorkflowPayload {
  schema: "ai-video-assistant.n8n-orchestration.v1";
  runId: string;
  createdAt: string;
  mode: N8nOrchestrationMode;
  topic: string;
  platform: PublishPlatform;
  baseUrl: string;
  safety: {
    livePublishEnabled: boolean;
    webhookRequiresConfirm: string;
    dispatchRequiresApprovedQueueItem: boolean;
    secretsIncluded: false;
  };
  inputs: {
    category: string;
    topN: number;
    audience?: string;
    durationSec: number;
    references: string[];
    videoPath?: string;
    queueItemId?: string;
    analyticsWindow: "30m" | "24h" | "7d" | "custom";
  };
  steps: N8nWorkflowStep[];
}

export interface N8nOrchestrationResult {
  status: N8nOrchestrationStatus;
  sent: boolean;
  endpoint?: string;
  payload: N8nWorkflowPayload;
  response?: unknown;
  workflowExport?: N8nWorkflowExportResult;
  message: string;
}

export interface N8nImportableWorkflowNode {
  id: string;
  name: string;
  type: string;
  typeVersion: number;
  position: [number, number];
  disabled?: boolean;
  retryOnFail?: boolean;
  maxTries?: number;
  waitBetweenTries?: number;
  parameters: Record<string, unknown>;
  notes?: string;
  notesInFlow?: boolean;
}

export interface N8nImportableWorkflow {
  name: string;
  nodes: N8nImportableWorkflowNode[];
  connections: Record<string, { main: Array<Array<{ node: string; type: "main"; index: number }>> }>;
  pinData: Record<string, unknown>;
  settings: Record<string, unknown>;
  staticData: null;
  tags: string[];
}

export interface N8nWorkflowExportResult {
  workflowPath: string;
  absolutePath: string;
  workflow: N8nImportableWorkflow;
  importNotes: string[];
}

export interface N8nWorkflowBlueprint {
  title: string;
  nodes: Array<{
    name: string;
    type: "webhook" | "httpRequest" | "manualApproval" | "schedule" | "note";
    target?: string;
    note: string;
  }>;
}

export function buildN8nWorkflowPayload(
  input: N8nOrchestrationInput,
  env: Record<string, string | undefined> = process.env
): N8nWorkflowPayload {
  const mode = input.mode ?? "dry-run";
  const baseUrl = (env.APP_BASE_URL || env.NEXT_PUBLIC_APP_URL || "http://127.0.0.1:5182").replace(/\/+$/, "");
  const category = input.category?.trim() || "all";
  const topN = input.topN && input.topN > 0 ? input.topN : 20;
  const durationSec = input.durationSec && input.durationSec > 0 ? input.durationSec : 45;
  const references = input.references?.map((item) => item.trim()).filter(Boolean).slice(0, 20) ?? [];
  const analyticsWindow = input.analyticsWindow ?? "30m";

  return {
    schema: "ai-video-assistant.n8n-orchestration.v1",
    runId: randomUUID(),
    createdAt: new Date().toISOString(),
    mode,
    topic: input.topic.trim(),
    platform: input.platform,
    baseUrl,
    safety: {
      livePublishEnabled: env.PUBLISH_LIVE_ENABLED === "true",
      webhookRequiresConfirm: N8N_CONFIRM_TEXT,
      dispatchRequiresApprovedQueueItem: true,
      secretsIncluded: false
    },
    inputs: {
      category,
      topN,
      audience: input.audience?.trim() || undefined,
      durationSec,
      references,
      videoPath: input.videoPath?.trim() || undefined,
      queueItemId: input.queueItemId?.trim() || undefined,
      analyticsWindow
    },
    steps: buildWorkflowSteps(baseUrl, input, { category, topN, durationSec, references, analyticsWindow })
  };
}

export function buildN8nWorkflowBlueprint(baseUrl = "http://127.0.0.1:5182"): N8nWorkflowBlueprint {
  const root = baseUrl.replace(/\/+$/, "");
  return {
    title: "AI video full-chain n8n workflow",
    nodes: [
      {
        name: "Cron trigger",
        type: "schedule",
        note: "Run daily or hourly for category trend scans."
      },
      {
        name: "AI Video Webhook",
        type: "webhook",
        note: "Receives this app payload from /api/orchestration/n8n."
      },
      {
        name: "Trend report",
        type: "httpRequest",
        target: `${root}/api/trend/report`,
        note: "Fetch ranked platform trends and potential score."
      },
      {
        name: "Script generation",
        type: "httpRequest",
        target: `${root}/api/script/generate`,
        note: "Create hook, beats, captions, tags, and B-roll needs."
      },
      {
        name: "Full-chain render",
        type: "httpRequest",
        target: `${root}/api/full-chain`,
        note: "Render Remotion/narrated video and platform variants."
      },
      {
        name: "Publish approval",
        type: "manualApproval",
        target: `${root}/api/publish/approve`,
        note: "Human approval is required before dispatch."
      },
      {
        name: "Dispatch draft",
        type: "httpRequest",
        target: `${root}/api/publish/dispatch`,
        note: "Create Postiz draft or local command preview."
      },
      {
        name: "Analytics import",
        type: "httpRequest",
        target: `${root}/api/analytics/import`,
        note: "Import 30m/24h/7d metrics and feed next decisions."
      }
    ]
  };
}

export function buildN8nImportableWorkflow(
  input: N8nOrchestrationInput,
  env: Record<string, string | undefined> = process.env
): N8nImportableWorkflow {
  const payload = buildN8nWorkflowPayload({ ...input, mode: "dry-run" }, env);
  const cronId = randomUUID();
  const webhookId = randomUUID();
  const trendId = randomUUID();
  const scriptId = randomUUID();
  const renderId = randomUUID();
  const queueId = randomUUID();
  const approvalNoteId = randomUUID();
  const approvalMappingNoteId = randomUUID();
  const dispatchId = randomUUID();
  const analyticsId = randomUUID();

  const nodes: N8nImportableWorkflowNode[] = [
    {
      id: cronId,
      name: "Daily trend schedule",
      type: "n8n-nodes-base.scheduleTrigger",
      typeVersion: 1.2,
      position: [0, 0],
      parameters: {
        rule: {
          interval: [{ field: "hours", hoursInterval: 6 }]
        }
      },
      notes: "Runs the scaffold every 6 hours. Adjust before activation.",
      notesInFlow: true
    },
    {
      id: webhookId,
      name: "Manual full-chain webhook",
      type: "n8n-nodes-base.webhook",
      typeVersion: 2,
      position: [0, 220],
      parameters: {
        httpMethod: "POST",
        path: "ai-video-full-chain",
        responseMode: "lastNode"
      },
      notes: "Optional manual trigger. Keep your n8n webhook secret outside this workflow JSON.",
      notesInFlow: true
    },
    httpNode(trendId, "01 Trend report", payload.steps[0].endpoint, payload.steps[0].payloadHint, [300, 80]),
    httpNode(scriptId, "02 Generate script", payload.steps[1].endpoint, payload.steps[1].payloadHint, [620, 80]),
    httpNode(renderId, "03 Full-chain render", payload.steps[2].endpoint, payload.steps[2].payloadHint, [940, 80]),
    httpNode(queueId, "04 Create publish queue", payload.steps[3].endpoint, payload.steps[3].payloadHint, [1260, 80]),
    {
      id: approvalNoteId,
      name: "Human approval required",
      type: "n8n-nodes-base.stickyNote",
      typeVersion: 1,
      position: [1260, 330],
      parameters: {
        content: [
          "Stop here until the publish queue item is approved in the local console.",
          "Dispatch requires manualConfirm=CONFIRM_DRY_RUN_ONLY and an approved queue item id.",
          "Keep PUBLISH_LIVE_ENABLED=false until real account tests are finished.",
          input.queueItemId
            ? `This export was created with approved queueItemId=${input.queueItemId}.`
            : "No approved queueItemId was supplied at export time."
        ].join("\n"),
        width: 360,
        height: 220
      }
    },
    {
      id: approvalMappingNoteId,
      name: "Approval id mapping",
      type: "n8n-nodes-base.stickyNote",
      typeVersion: 1,
      position: [1580, 330],
      parameters: {
        content: [
          "Before enabling dispatch:",
          "1. Open the local console publish queue.",
          "2. Approve exactly one ready item with CONFIRM_DRY_RUN_ONLY.",
          "3. Copy that approved item id into the dispatch node body if this export still says REPLACE_WITH_APPROVED_QUEUE_ITEM_ID.",
          "The dispatch node stays disabled by default so this workflow cannot publish silently."
        ].join("\n"),
        width: 420,
        height: 220
      }
    },
    {
      ...httpNode(dispatchId, "05 Dispatch approved draft", payload.steps[4].endpoint, payload.steps[4].payloadHint, [1580, 80]),
      disabled: true,
      notes: input.queueItemId
        ? "Disabled by default. This export includes a queueItemId, but dispatch must still be reviewed before enabling."
        : "Disabled by default. Replace REPLACE_WITH_APPROVED_QUEUE_ITEM_ID with an approved queue item id before enabling.",
      notesInFlow: true
    },
    {
      ...httpNode(analyticsId, "06 Import analytics snapshot", payload.steps[5].endpoint, payload.steps[5].payloadHint, [1900, 80]),
      disabled: true,
      notes: "Disabled by default. Wire platform metrics from Postiz/TikHub/manual import before enabling.",
      notesInFlow: true
    }
  ];

  return {
    name: `AI video full-chain - ${payload.platform} - ${payload.topic.slice(0, 32)}`,
    nodes,
    connections: {
      "Daily trend schedule": { main: [[{ node: "01 Trend report", type: "main", index: 0 }]] },
      "Manual full-chain webhook": { main: [[{ node: "01 Trend report", type: "main", index: 0 }]] },
      "01 Trend report": { main: [[{ node: "02 Generate script", type: "main", index: 0 }]] },
      "02 Generate script": { main: [[{ node: "03 Full-chain render", type: "main", index: 0 }]] },
      "03 Full-chain render": { main: [[{ node: "04 Create publish queue", type: "main", index: 0 }]] },
      "04 Create publish queue": { main: [[{ node: "05 Dispatch approved draft", type: "main", index: 0 }]] },
      "05 Dispatch approved draft": { main: [[{ node: "06 Import analytics snapshot", type: "main", index: 0 }]] }
    },
    pinData: {},
    settings: {
      executionOrder: "v1",
      saveExecutionProgress: true,
      saveManualExecutions: true
    },
    staticData: null,
    tags: ["ai-video-assistant", "draft", "dry-run-first"],
  };
}

export async function exportN8nWorkflowFile(
  input: N8nOrchestrationInput,
  deps: {
    env?: Record<string, string | undefined>;
    now?: () => Date;
  } = {}
): Promise<N8nWorkflowExportResult> {
  const workflow = buildN8nImportableWorkflow(input, deps.env ?? process.env);
  const timestamp = (deps.now?.() ?? new Date()).toISOString().replace(/[:.]/g, "-");
  const fileName = `n8n-workflow-${slug(input.platform)}-${timestamp}.json`;
  const absolutePath = path.join(draftsRoot, fileName);
  ensureDir(draftsRoot);
  await fs.writeFile(absolutePath, `${JSON.stringify(workflow, null, 2)}\n`, "utf8");

  return {
    workflowPath: `workspace/drafts/${fileName}`,
    absolutePath,
    workflow,
    importNotes: [
      "Import the JSON in n8n via the workflow editor or CLI.",
      "No credentials or API keys are embedded in this workflow.",
      `HTTP nodes include retryOnFail=${N8N_HTTP_MAX_TRIES} tries with ${N8N_HTTP_WAIT_BETWEEN_TRIES_MS}ms between tries.`,
      "Review APP_BASE_URL, schedule interval, queue approval id mapping, and disabled dispatch/analytics nodes before activation."
    ]
  };
}

export async function triggerN8nOrchestration(
  input: N8nOrchestrationInput,
  deps: {
    env?: Record<string, string | undefined>;
    fetch?: typeof fetch;
  } = {}
): Promise<N8nOrchestrationResult> {
  const env = deps.env ?? process.env;
  const payload = buildN8nWorkflowPayload(input, env);
  const endpoint = env.N8N_WEBHOOK_URL?.trim();

  if (payload.mode !== "webhook") {
    return {
      status: "preview",
      sent: false,
      endpoint,
      payload,
      message: "n8n dry-run payload generated. No webhook was called."
    };
  }

  if (input.manualConfirm !== N8N_CONFIRM_TEXT) {
    return {
      status: "blocked",
      sent: false,
      endpoint,
      payload,
      message: `Webhook blocked. Type ${N8N_CONFIRM_TEXT} to confirm an external n8n call.`
    };
  }

  if (!endpoint) {
    return {
      status: "preview",
      sent: false,
      payload,
      message: "N8N_WEBHOOK_URL is not configured, so only a payload preview was generated."
    };
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/json"
  };
  if (env.N8N_WEBHOOK_SECRET) {
    headers["X-AI-Video-Secret"] = env.N8N_WEBHOOK_SECRET;
  }

  const response = await (deps.fetch ?? fetch)(endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify(payload)
  });
  const body = await response.text();
  let parsed: unknown = body;
  try {
    parsed = body ? JSON.parse(body) : null;
  } catch {
    parsed = body;
  }

  if (!response.ok) {
    throw new Error(`n8n webhook request failed ${response.status}: ${body}`);
  }

  return {
    status: "sent",
    sent: true,
    endpoint,
    payload,
    response: parsed,
    message: "n8n webhook was called successfully."
  };
}

function buildWorkflowSteps(
  baseUrl: string,
  input: N8nOrchestrationInput,
  defaults: {
    category: string;
    topN: number;
    durationSec: number;
    references: string[];
    analyticsWindow: "30m" | "24h" | "7d" | "custom";
  }
): N8nWorkflowStep[] {
  return [
    {
      id: "trend",
      label: "Fetch trend report",
      method: "POST",
      endpoint: `${baseUrl}/api/trend/report`,
      requiresHumanApproval: false,
      payloadHint: {
        platform: input.platform === "kuaishou" ? "douyin" : input.platform,
        category: defaults.category,
        topN: defaults.topN
      }
    },
    {
      id: "script",
      label: "Generate script package",
      method: "POST",
      endpoint: `${baseUrl}/api/script/generate`,
      requiresHumanApproval: false,
      payloadHint: {
        topic: input.topic.trim(),
        platform: input.platform,
        audience: input.audience,
        durationSec: defaults.durationSec,
        references: defaults.references
      }
    },
    {
      id: "render",
      label: "Render full-chain video",
      method: "POST",
      endpoint: `${baseUrl}/api/full-chain`,
      requiresHumanApproval: false,
      payloadHint: {
        topic: input.topic.trim(),
        platform: input.platform,
        durationSec: defaults.durationSec,
        references: defaults.references,
        narrated: true
      }
    },
    {
      id: "publishQueue",
      label: "Create publish queue item",
      method: "POST",
      endpoint: `${baseUrl}/api/publish/queue`,
      requiresHumanApproval: false,
      payloadHint: {
        platform: input.platform,
        videoPath: input.videoPath || "{{render.outputPath}}",
        title: input.topic.trim(),
        tags: "{{script.tags}}"
      }
    },
    {
      id: "dispatch",
      label: "Dispatch approved draft",
      method: "POST",
      endpoint: `${baseUrl}/api/publish/dispatch`,
      requiresHumanApproval: true,
      payloadHint: {
        id: input.queueItemId?.trim() || "REPLACE_WITH_APPROVED_QUEUE_ITEM_ID",
        mode: "draft",
        manualConfirm: "CONFIRM_DRY_RUN_ONLY"
      }
    },
    {
      id: "analytics",
      label: "Import analytics snapshot",
      method: "POST",
      endpoint: `${baseUrl}/api/analytics/import`,
      requiresHumanApproval: false,
      payloadHint: {
        platform: input.platform,
        title: input.topic.trim(),
        window: defaults.analyticsWindow,
        metrics: "{{platformMetrics}}"
      }
    }
  ];
}

function httpNode(
  id: string,
  name: string,
  url: string,
  payload: Record<string, unknown>,
  position: [number, number]
): N8nImportableWorkflowNode {
  return {
    id,
    name,
    type: "n8n-nodes-base.httpRequest",
    typeVersion: 4.2,
    position,
    retryOnFail: true,
    maxTries: N8N_HTTP_MAX_TRIES,
    waitBetweenTries: N8N_HTTP_WAIT_BETWEEN_TRIES_MS,
    parameters: {
      method: "POST",
      url,
      sendHeaders: true,
      headerParameters: {
        parameters: [{ name: "Content-Type", value: "application/json" }]
      },
      sendBody: true,
      contentType: "json",
      specifyBody: "json",
      jsonBody: JSON.stringify(payload, null, 2),
      options: {
        timeout: 1_200_000,
        response: { response: { responseFormat: "json" } }
      }
    }
  };
}

function slug(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || "workflow";
}
