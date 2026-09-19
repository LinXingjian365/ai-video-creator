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

  it("builds the real social-auto-upload CLI shape (not the old flag style)", () => {
    // 回归:此前生成的是 `--platform/--video/--dry-run` 这套上游根本不存在的参数。
    // 上游真实形态是 `sau <platform> upload-video --account ... --file ...`,且没有 --dry-run。
    const args = buildSocialAutoUploadCommand(approvedItem, {});
    expect(args).toEqual([
      "python",
      "sau_cli.py",
      "douyin",
      "upload-video",
      "--account", "douyin",
      "--file", "workspace/output/demo.mp4",
      "--title", "标题",
      "--desc", "简介",
      "--tags", "AI,剪辑"
    ]);
    expect(args).not.toContain("--dry-run");
  });

  it("adds the required --tid and --desc for bilibili", () => {
    const biliItem = { ...approvedItem, input: { ...approvedItem.input, platform: "bilibili" as const } };
    const args = buildSocialAutoUploadCommand(biliItem, {
      SOCIAL_AUTO_UPLOAD_DIR: "A:/sau",
      SOCIAL_AUTO_UPLOAD_ACCOUNT_BILIBILI: "my_bili",
      SOCIAL_AUTO_UPLOAD_BILIBILI_TID: "249"
    });

    expect(args[0]).toBe("A:/sau\\.venv\\Scripts\\python.exe");
    expect(args[1]).toBe("A:/sau\\sau_cli.py");
    expect(args).toEqual(expect.arrayContaining(["--account", "my_bili", "--tid", "249", "--desc", "简介"]));
  });

  it("gives bilibili an empty --desc when description is missing", () => {
    const biliItem = {
      ...approvedItem,
      input: { ...approvedItem.input, platform: "bilibili" as const, description: undefined }
    };
    const args = buildSocialAutoUploadCommand(biliItem, {});
    expect(args).toEqual(expect.arrayContaining(["--desc", ""]));
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

  it("never dispatches a domestic platform to Postiz, even with Postiz env set", async () => {
    // 回归:Postiz 不支持抖音/快手/B站。配了 Postiz env 也不该走 postiz adapter,
    // 而是走 manual(产出合规成片,人工发布)。
    const queue: PublishQueueState = { schema: "ai-video-assistant.publish-queue.v1", updatedAt: "", items: [approvedItem] };
    const result = await dispatchPublishQueueItem(
      { id: "q1", manualConfirm: PUBLISH_CONFIRM_TEXT, mode: "draft" },
      {
        env: {
          POSTIZ_URL: "https://postiz.example.com",
          POSTIZ_API_KEY: "key",
          POSTIZ_INTEGRATION_ID_DOUYIN: "int-1"
        },
        readPublishQueue: vi.fn(async () => queue),
        writePublishQueue: vi.fn(async (next) => next)
      }
    );
    expect(result.adapter).toBe("manual");
    expect(result.sent).toBe(false);
    expect(result.message).toContain("手动发布");
  });
});

describe("social-auto-upload 执行闸门", () => {
  const queue = (): PublishQueueState => ({
    schema: "ai-video-assistant.publish-queue.v1",
    updatedAt: "",
    items: [approvedItem]
  });
  // CLI 指到一个真实存在的文件,让 existsSync 通过;DIR 非空才会选 social-auto-upload adapter。
  const baseEnv = { SOCIAL_AUTO_UPLOAD_DIR: ".", SOCIAL_AUTO_UPLOAD_CLI: "package.json" };

  it("默认只预览,不执行外部命令", async () => {
    const run = vi.fn();
    const result = await dispatchPublishQueueItem(
      { id: "q1", manualConfirm: PUBLISH_CONFIRM_TEXT, mode: "live" },
      {
        env: { ...baseEnv, PUBLISH_LIVE_ENABLED: "true" },
        runPublishCommand: run as never,
        readPublishQueue: vi.fn(async () => queue()),
        writePublishQueue: vi.fn(async (next) => next)
      }
    );

    expect(result.status).toBe("preview");
    expect(result.sent).toBe(false);
    expect(run).not.toHaveBeenCalled();
  });

  it("三个闸门全开才真正执行并落库", async () => {
    const run = vi.fn(async () => ({ code: 0, stdout: "上传成功", stderr: "" }));
    const writeQueue = vi.fn(async (next: PublishQueueState) => next);

    const result = await dispatchPublishQueueItem(
      { id: "q1", manualConfirm: PUBLISH_CONFIRM_TEXT, mode: "live" },
      {
        env: { ...baseEnv, PUBLISH_LIVE_ENABLED: "true", SOCIAL_AUTO_UPLOAD_EXECUTE: "true" },
        runPublishCommand: run as never,
        readPublishQueue: vi.fn(async () => queue()),
        writePublishQueue: writeQueue
      }
    );

    expect(result.status).toBe("sent");
    expect(result.sent).toBe(true);
    expect(run).toHaveBeenCalledTimes(1);
    expect(writeQueue.mock.calls[0][0].items[0].status).toBe("published");
  });

  it("找不到 CLI 时报 blocked 而不是静默成功", async () => {
    const result = await dispatchPublishQueueItem(
      { id: "q1", manualConfirm: PUBLISH_CONFIRM_TEXT, mode: "live" },
      {
        env: { SOCIAL_AUTO_UPLOAD_DIR: "A:/definitely-not-here" },
        readPublishQueue: vi.fn(async () => queue()),
        writePublishQueue: vi.fn(async (next) => next)
      }
    );

    expect(result.status).toBe("blocked");
    expect(result.message).toContain("找不到");
  });
});
