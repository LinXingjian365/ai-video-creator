import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { draftsRoot } from "@/lib/paths";
import { getPublishAdapterStatus, type PublishAdapterStatus } from "@/lib/publish/adapters";
import { dryRunPublish, type PublishDryRunResult, type PublishInput } from "@/lib/publish/dry-run";

export type PublishQueueStatus = "blocked" | "ready" | "approved" | "published" | "cancelled";

export interface PublishQueueItem {
  id: string;
  status: PublishQueueStatus;
  createdAt: string;
  updatedAt: string;
  approvedAt?: string;
  scheduledAt?: string;
  input: PublishInput;
  dryRun: PublishDryRunResult;
  adapter: PublishAdapterStatus;
  approval?: {
    manualConfirm: string;
    note?: string;
  };
}

export interface PublishQueueState {
  schema: "ai-video-assistant.publish-queue.v1";
  updatedAt: string;
  items: PublishQueueItem[];
}

export interface CreatePublishQueueItemInput extends PublishInput {
  scheduledAt?: string;
}

export const PUBLISH_QUEUE_FILE = path.join(draftsRoot, "publish-queue.json");
export const PUBLISH_CONFIRM_TEXT = "CONFIRM_DRY_RUN_ONLY";

export async function readPublishQueue(filePath = PUBLISH_QUEUE_FILE): Promise<PublishQueueState> {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    const parsed = JSON.parse(raw) as PublishQueueState;
    if (parsed.schema === "ai-video-assistant.publish-queue.v1" && Array.isArray(parsed.items)) {
      return parsed;
    }
  } catch {
    // Missing or malformed queue starts fresh; individual publish items are dry-run reproducible.
  }
  return { schema: "ai-video-assistant.publish-queue.v1", updatedAt: new Date(0).toISOString(), items: [] };
}

export async function writePublishQueue(state: PublishQueueState, filePath = PUBLISH_QUEUE_FILE): Promise<PublishQueueState> {
  const next = { ...state, updatedAt: new Date().toISOString() };
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(next, null, 2)}\n`, "utf8");
  return next;
}

export async function createPublishQueueItem(
  input: CreatePublishQueueItemInput,
  deps: {
    dryRunPublish: typeof dryRunPublish;
    getPublishAdapterStatus: typeof getPublishAdapterStatus;
    readPublishQueue: typeof readPublishQueue;
    writePublishQueue: typeof writePublishQueue;
  } = { dryRunPublish, getPublishAdapterStatus, readPublishQueue, writePublishQueue }
): Promise<PublishQueueItem> {
  const dryRun = await deps.dryRunPublish(input);
  const adapter = deps.getPublishAdapterStatus(input.platform);
  const now = new Date().toISOString();
  const item: PublishQueueItem = {
    id: randomUUID(),
    status: dryRun.willPublish ? "ready" : "blocked",
    createdAt: now,
    updatedAt: now,
    scheduledAt: input.scheduledAt,
    input: {
      platform: input.platform,
      videoPath: input.videoPath,
      title: input.title,
      description: input.description,
      tags: input.tags
    },
    dryRun,
    adapter
  };
  const queue = await deps.readPublishQueue();
  queue.items = [item, ...queue.items].slice(0, 200);
  await deps.writePublishQueue(queue);
  return item;
}

export async function approvePublishQueueItem(
  id: string,
  manualConfirm: string,
  note?: string,
  deps: {
    readPublishQueue: typeof readPublishQueue;
    writePublishQueue: typeof writePublishQueue;
  } = { readPublishQueue, writePublishQueue }
): Promise<PublishQueueItem> {
  if (manualConfirm !== PUBLISH_CONFIRM_TEXT) {
    throw new Error(`人工确认失败:请输入 ${PUBLISH_CONFIRM_TEXT}`);
  }

  const queue = await deps.readPublishQueue();
  const index = queue.items.findIndex((item) => item.id === id);
  if (index < 0) {
    throw new Error(`找不到发布队列项:${id}`);
  }
  const item = queue.items[index];
  if (item.status === "blocked" || !item.dryRun.willPublish) {
    throw new Error("dry-run 未通过,不能进入人工批准。");
  }
  if (!item.adapter.dryRunOnly) {
    throw new Error("发布 adapter 状态异常:当前版本只允许 dry-run 队列。");
  }

  const now = new Date().toISOString();
  const approved: PublishQueueItem = {
    ...item,
    status: "approved",
    approvedAt: now,
    updatedAt: now,
    approval: { manualConfirm, note }
  };
  queue.items[index] = approved;
  await deps.writePublishQueue(queue);
  return approved;
}
