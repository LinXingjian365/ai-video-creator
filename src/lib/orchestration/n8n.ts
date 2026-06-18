import { randomUUID } from "node:crypto";
import type { PublishPlatform } from "@/lib/publish/dry-run";

export const N8N_CONFIRM_TEXT = "CONFIRM_N8N_WEBHOOK";

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
  message: string;
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
        id: input.queueItemId || "{{approvedQueueItem.id}}",
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
