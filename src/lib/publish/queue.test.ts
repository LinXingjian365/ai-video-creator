import { describe, expect, it, vi } from "vitest";
import { getPublishAdapterStatus } from "@/lib/publish/adapters";
import type { PublishDryRunResult, PublishInput } from "@/lib/publish/dry-run";
import {
  approvePublishQueueItem,
  createPublishQueueItem,
  PUBLISH_CONFIRM_TEXT,
  type PublishQueueItem,
  type PublishQueueState
} from "@/lib/publish/queue";

function dryRun(input: PublishInput, willPublish = true): PublishDryRunResult {
  return {
    platform: input.platform,
    platformLabel: input.platform === "bilibili" ? "B站" : input.platform === "kuaishou" ? "快手" : "抖音",
    videoPath: input.videoPath,
    willPublish,
    checks: [{ label: "成片文件", status: willPublish ? "pass" : "fail", detail: willPublish ? "ok" : "missing" }],
    payloadPreview: {
      title: input.title,
      description: input.description ?? "",
      tags: input.tags ?? [],
      aspect: "9:16",
      durationSec: 30
    },
    note: "dry-run"
  };
}

describe("publish queue", () => {
  it("creates a ready queue item when dry-run passes", async () => {
    let state: PublishQueueState = { schema: "ai-video-assistant.publish-queue.v1", updatedAt: "", items: [] };
    const writePublishQueue = vi.fn(async (next: PublishQueueState) => {
      state = { ...next };
      return state;
    });

    const item = await createPublishQueueItem(
      { platform: "douyin", videoPath: "workspace/output/a.mp4", title: "标题", tags: ["剪辑"] },
      {
        dryRunPublish: vi.fn(async (input: PublishInput) => dryRun(input, true)),
        getPublishAdapterStatus: vi.fn((platform) => getPublishAdapterStatus(platform, {})),
        readPublishQueue: vi.fn(async () => state),
        writePublishQueue
      }
    );

    expect(item.status).toBe("ready");
    expect(item.adapter.dryRunOnly).toBe(true);
    expect(state.items[0].id).toBe(item.id);
    expect(writePublishQueue).toHaveBeenCalledOnce();
  });

  it("creates a blocked queue item when dry-run fails", async () => {
    let state: PublishQueueState = { schema: "ai-video-assistant.publish-queue.v1", updatedAt: "", items: [] };
    const item = await createPublishQueueItem(
      { platform: "douyin", videoPath: "missing.mp4", title: "标题" },
      {
        dryRunPublish: vi.fn(async (input: PublishInput) => dryRun(input, false)),
        getPublishAdapterStatus: vi.fn((platform) => getPublishAdapterStatus(platform, {})),
        readPublishQueue: vi.fn(async () => state),
        writePublishQueue: vi.fn(async (next: PublishQueueState) => {
          state = { ...next };
          return state;
        })
      }
    );

    expect(item.status).toBe("blocked");
    expect(item.dryRun.willPublish).toBe(false);
  });

  it("requires the exact manual confirmation text before approval", async () => {
    const ready: PublishQueueItem = await createPublishQueueItem(
      { platform: "douyin", videoPath: "workspace/output/a.mp4", title: "标题" },
      {
        dryRunPublish: vi.fn(async (input: PublishInput) => dryRun(input, true)),
        getPublishAdapterStatus: vi.fn((platform) => getPublishAdapterStatus(platform, {})),
        readPublishQueue: vi.fn(async (): Promise<PublishQueueState> => ({ schema: "ai-video-assistant.publish-queue.v1", updatedAt: "", items: [] })),
        writePublishQueue: vi.fn(async (next: PublishQueueState) => next)
      }
    );
    let state: PublishQueueState = { schema: "ai-video-assistant.publish-queue.v1", updatedAt: "", items: [ready] };

    await expect(
      approvePublishQueueItem(ready.id, "YES", undefined, {
        readPublishQueue: vi.fn(async () => state),
        writePublishQueue: vi.fn(async (next: PublishQueueState) => next)
      })
    ).rejects.toThrow(PUBLISH_CONFIRM_TEXT);

    const approved = await approvePublishQueueItem(ready.id, PUBLISH_CONFIRM_TEXT, "人工看过", {
      readPublishQueue: vi.fn(async () => state),
      writePublishQueue: vi.fn(async (next: PublishQueueState) => {
        state = { ...next };
        return state;
      })
    });
    expect(approved.status).toBe("approved");
    expect(approved.approval?.note).toBe("人工看过");
  });
});
