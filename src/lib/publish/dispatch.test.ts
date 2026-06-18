import { describe, expect, it, vi } from "vitest";
import {
  buildPlatformContent,
  buildPostizDraftPayload,
  buildSocialAutoUploadCommand,
  dispatchPublishQueueItem,
  postizPublicBaseUrl
} from "@/lib/publish/dispatch";
import { PUBLISH_CONFIRM_TEXT, type PublishQueueItem, type PublishQueueState } from "@/lib/publish/queue";

const approvedItem: PublishQueueItem = {
  id: "q1",
  status: "approved",
  createdAt: "2026-06-18T00:00:00.000Z",
  updatedAt: "2026-06-18T00:00:00.000Z",
  approvedAt: "2026-06-18T00:00:00.000Z",
  input: {
    platform: "douyin",
    videoPath: "workspace/output/demo.mp4",
    title: "标题",
    description: "简介",
    tags: ["AI", "#剪辑"]
  },
  dryRun: {
    platform: "douyin",
    platformLabel: "抖音",
    videoPath: "workspace/output/demo.mp4",
    willPublish: true,
    checks: [],
    payloadPreview: { title: "标题", description: "简介", tags: ["AI"], aspect: "9:16", durationSec: 30 },
    note: "dry-run"
  },
  adapter: {
    platform: "douyin",
    platformLabel: "抖音",
    adapter: "manual",
    configured: false,
    canPublish: false,
    dryRunOnly: true,
    manualConfirmRequired: true,
    requiredEnv: [],
    hints: []
  },
  approval: { manualConfirm: PUBLISH_CONFIRM_TEXT }
};

describe("publish dispatch", () => {
  it("normalizes Postiz public base url", () => {
    expect(postizPublicBaseUrl({ POSTIZ_URL: "https://postiz.example.com" })).toBe("https://postiz.example.com/public/v1");
    expect(postizPublicBaseUrl({ POSTIZ_URL: "https://postiz.example.com/public/v1" })).toBe("https://postiz.example.com/public/v1");
  });

  it("builds platform-native content and Postiz draft payload", () => {
    expect(buildPlatformContent(approvedItem)).toContain("#剪辑");
    const payload = buildPostizDraftPayload(approvedItem, {
      POSTIZ_INTEGRATION_ID_DOUYIN: "int-1",
      POSTIZ_PLATFORM_TYPE_DOUYIN: "tiktok"
    });
    expect(payload).toMatchObject({
      type: "draft",
      posts: [{ integration: { id: "int-1" }, settings: { __type: "tiktok" } }]
    });
  });

  it("previews social-auto-upload command without executing it", () => {
    const args = buildSocialAutoUploadCommand(approvedItem, { SOCIAL_AUTO_UPLOAD_COMMAND: "sau" });
    expect(args).toEqual(expect.arrayContaining(["sau", "--platform", "douyin", "--dry-run"]));
  });

  it("requires approved queue item and manual confirmation", async () => {
    await expect(
      dispatchPublishQueueItem(
        { id: "q1", manualConfirm: "NO" },
        {
          readPublishQueue: vi.fn(async (): Promise<PublishQueueState> => ({
            schema: "ai-video-assistant.publish-queue.v1",
            updatedAt: "",
            items: [approvedItem]
          }))
        }
      )
    ).rejects.toThrow(PUBLISH_CONFIRM_TEXT);
  });

  it("returns Postiz request preview unless live is explicitly enabled", async () => {
    const queue: PublishQueueState = { schema: "ai-video-assistant.publish-queue.v1", updatedAt: "", items: [approvedItem] };
    const result = await dispatchPublishQueueItem(
      { id: "q1", manualConfirm: PUBLISH_CONFIRM_TEXT, mode: "draft" },
      {
        env: {
          POSTIZ_URL: "https://postiz.example.com",
          POSTIZ_API_KEY: "key",
          POSTIZ_INTEGRATION_ID_DOUYIN: "int-1",
          POSTIZ_PLATFORM_TYPE_DOUYIN: "tiktok"
        },
        readPublishQueue: vi.fn(async () => queue),
        writePublishQueue: vi.fn(async (next) => next)
      }
    );
    expect(result).toMatchObject({ adapter: "postiz", sent: false, status: "preview" });
    expect(result.endpoint).toBe("https://postiz.example.com/public/v1/posts");
  });

  it("sends Postiz draft when live flag is enabled but still uses draft type", async () => {
    const queue: PublishQueueState = { schema: "ai-video-assistant.publish-queue.v1", updatedAt: "", items: [approvedItem] };
    const fetchMock = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) =>
      new Response(JSON.stringify([{ postId: "p1", integration: "int-1" }]), { status: 200 })
    );
    const writeQueue = vi.fn(async (next: PublishQueueState) => next);
    const result = await dispatchPublishQueueItem(
      { id: "q1", manualConfirm: PUBLISH_CONFIRM_TEXT, mode: "draft" },
      {
        env: {
          PUBLISH_LIVE_ENABLED: "true",
          POSTIZ_URL: "https://postiz.example.com",
          POSTIZ_API_KEY: "key",
          POSTIZ_INTEGRATION_ID_DOUYIN: "int-1",
          POSTIZ_PLATFORM_TYPE_DOUYIN: "tiktok"
        },
        fetch: fetchMock as never,
        readPublishQueue: vi.fn(async () => queue),
        writePublishQueue: writeQueue
      }
    );
    expect(result).toMatchObject({ adapter: "postiz", sent: true, status: "drafted" });
    expect(fetchMock).toHaveBeenCalledWith("https://postiz.example.com/public/v1/posts", expect.objectContaining({ method: "POST" }));
    const requestInit = fetchMock.mock.calls[0][1] as RequestInit;
    expect(JSON.parse(requestInit.body as string).type).toBe("draft");
    expect(writeQueue.mock.calls[0][0].items[0].status).toBe("published");
  });
});
