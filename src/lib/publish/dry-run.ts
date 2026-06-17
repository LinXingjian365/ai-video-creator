import { getVideoInfo } from "@/lib/ffmpeg";
import { resolveLocalPath } from "@/lib/paths";

export type PublishPlatform = "douyin" | "kuaishou" | "bilibili";
export type CheckStatus = "pass" | "warn" | "fail";

export interface PublishSpec {
  platform: PublishPlatform;
  label: string;
  titleMax: number;
  descMax: number;
  tagMax: number;
  preferredAspect: "9:16" | "16:9";
  maxDurationSec: number;
}

// 各平台限制为合理近似值（平台规则会变，dry-run 用于提前发现明显问题，不是官方承诺）
export const publishSpecs: Record<PublishPlatform, PublishSpec> = {
  douyin: { platform: "douyin", label: "抖音", titleMax: 55, descMax: 2200, tagMax: 5, preferredAspect: "9:16", maxDurationSec: 900 },
  kuaishou: { platform: "kuaishou", label: "快手", titleMax: 50, descMax: 1000, tagMax: 8, preferredAspect: "9:16", maxDurationSec: 600 },
  bilibili: { platform: "bilibili", label: "B站", titleMax: 80, descMax: 2000, tagMax: 10, preferredAspect: "16:9", maxDurationSec: 7200 }
};

export interface PublishProbe {
  exists: boolean;
  hasVideo: boolean;
  width: number;
  height: number;
  durationSec: number;
}

export interface PublishInput {
  platform: PublishPlatform;
  videoPath: string;
  title: string;
  description?: string;
  tags?: string[];
}

export interface PublishCheck {
  label: string;
  status: CheckStatus;
  detail: string;
}

export interface PublishDryRunResult {
  platform: PublishPlatform;
  platformLabel: string;
  videoPath: string;
  willPublish: boolean;
  checks: PublishCheck[];
  payloadPreview: {
    title: string;
    description: string;
    tags: string[];
    aspect: string;
    durationSec: number;
  };
  note: string;
}

export function aspectRatioOf(width: number, height: number): "9:16" | "16:9" | "1:1" | "other" {
  if (width <= 0 || height <= 0) {
    return "other";
  }
  const ratio = width / height;
  if (Math.abs(ratio - 9 / 16) < 0.05) {
    return "9:16";
  }
  if (Math.abs(ratio - 16 / 9) < 0.06) {
    return "16:9";
  }
  if (Math.abs(ratio - 1) < 0.05) {
    return "1:1";
  }
  return "other";
}

export function buildPublishChecks(input: PublishInput, probe: PublishProbe): PublishCheck[] {
  const spec = publishSpecs[input.platform];
  const checks: PublishCheck[] = [];

  checks.push(
    probe.exists
      ? { label: "成片文件", status: "pass", detail: `已找到 ${input.videoPath}` }
      : { label: "成片文件", status: "fail", detail: `找不到成片:${input.videoPath}` }
  );

  if (probe.exists) {
    checks.push(
      probe.hasVideo
        ? { label: "视频流", status: "pass", detail: `${probe.width}x${probe.height}` }
        : { label: "视频流", status: "fail", detail: "文件没有有效视频流" }
    );
  }

  const title = input.title.trim();
  if (!title) {
    checks.push({ label: "标题", status: "fail", detail: "标题不能为空" });
  } else if (title.length > spec.titleMax) {
    checks.push({ label: "标题", status: "fail", detail: `标题 ${title.length} 字,超过 ${spec.label} 上限 ${spec.titleMax}` });
  } else {
    checks.push({ label: "标题", status: "pass", detail: `${title.length}/${spec.titleMax} 字` });
  }

  const description = (input.description ?? "").trim();
  if (description.length > spec.descMax) {
    checks.push({ label: "简介", status: "fail", detail: `简介 ${description.length} 字,超过 ${spec.label} 上限 ${spec.descMax}` });
  } else {
    checks.push({ label: "简介", status: "pass", detail: `${description.length}/${spec.descMax} 字` });
  }

  const tags = input.tags ?? [];
  if (tags.length > spec.tagMax) {
    checks.push({ label: "标签数量", status: "warn", detail: `${tags.length} 个标签,${spec.label} 建议不超过 ${spec.tagMax},超出部分可能被截断` });
  } else {
    checks.push({ label: "标签数量", status: "pass", detail: `${tags.length}/${spec.tagMax}` });
  }

  if (probe.exists && probe.hasVideo) {
    const aspect = aspectRatioOf(probe.width, probe.height);
    if (aspect === spec.preferredAspect) {
      checks.push({ label: "画幅比例", status: "pass", detail: `${aspect} 符合 ${spec.label} 推荐` });
    } else {
      checks.push({ label: "画幅比例", status: "warn", detail: `成片为 ${aspect},${spec.label} 推荐 ${spec.preferredAspect},建议先出对应变体` });
    }

    if (probe.durationSec > spec.maxDurationSec) {
      checks.push({ label: "时长", status: "fail", detail: `${Math.round(probe.durationSec)}s 超过 ${spec.label} 上限 ${spec.maxDurationSec}s` });
    } else {
      checks.push({ label: "时长", status: "pass", detail: `${Math.round(probe.durationSec)}s / ${spec.maxDurationSec}s` });
    }
  }

  return checks;
}

export async function dryRunPublish(
  input: PublishInput,
  deps: { getVideoInfo: typeof getVideoInfo } = { getVideoInfo }
): Promise<PublishDryRunResult> {
  const spec = publishSpecs[input.platform];
  let probe: PublishProbe = { exists: false, hasVideo: false, width: 0, height: 0, durationSec: 0 };
  try {
    const info = await deps.getVideoInfo(resolveLocalPath(input.videoPath));
    probe = {
      exists: true,
      hasVideo: info.width > 0 && info.height > 0,
      width: info.width,
      height: info.height,
      durationSec: info.duration
    };
  } catch {
    probe = { exists: false, hasVideo: false, width: 0, height: 0, durationSec: 0 };
  }

  const checks = buildPublishChecks(input, probe);
  const willPublish = !checks.some((check) => check.status === "fail");

  return {
    platform: input.platform,
    platformLabel: spec.label,
    videoPath: input.videoPath,
    willPublish,
    checks,
    payloadPreview: {
      title: input.title.trim(),
      description: (input.description ?? "").trim(),
      tags: input.tags ?? [],
      aspect: aspectRatioOf(probe.width, probe.height),
      durationSec: Math.round(probe.durationSec)
    },
    note: "这是 dry-run:只做本地校验和发布载荷预览,不会真实上传到任何平台。"
  };
}
