import fs from "node:fs/promises";
import path from "node:path";
import { bundle } from "@remotion/bundler";
import { renderMedia, selectComposition } from "@remotion/renderer";
import { mixBackgroundMusic } from "@/lib/audio-mix";
import { stageBrollAssets } from "@/lib/broll";
import { outputRoot, resolveLocalPath } from "@/lib/paths";
import type { ScriptPackageProps } from "@/remotion/ScriptPackage";

export type RemotionAspectRatio = "9:16" | "16:9";

export interface RemotionRenderInput extends Partial<ScriptPackageProps> {
  aspectRatio: RemotionAspectRatio;
  outputPath?: string;
  bgmPath?: string;
  bgmVolume?: number;
}

export interface RemotionRenderResult {
  outputPath: string;
  compositionId: string;
  bundleLocation: string;
  bgmPath?: string;
  bgmVolume?: number;
}

export async function renderScriptPackage(input: RemotionRenderInput): Promise<RemotionRenderResult> {
  const compositionId = input.aspectRatio === "16:9" ? "ScriptPackageWide" : "ScriptPackageVertical";
  const outputPath = resolveLocalPath(
    input.outputPath ?? path.join(outputRoot, "remotion", `${Date.now()}-script-package.mp4`)
  );
  const renderOutputPath = input.bgmPath
    ? path.join(
      path.dirname(outputPath),
      `${path.basename(outputPath, path.extname(outputPath))}.silent-${Date.now()}${path.extname(outputPath) || ".mp4"}`
    )
    : outputPath;
  await fs.mkdir(path.dirname(outputPath), { recursive: true });

  const entryPoint = path.join(process.cwd(), "src", "remotion", "index.ts");

  // 本地 B-roll 必须暂存进 publicDir 供 staticFile 解析(compositor 不收 file://);bundle 会把它拷进产物。
  let stagingDir: string | undefined;
  let broll = input.broll;
  if (input.broll && input.broll.length > 0) {
    stagingDir = path.join(outputRoot, "remotion-public", `${Date.now()}-broll`);
    broll = await stageBrollAssets(input.broll, stagingDir);
  }

  const bundleLocation = await bundle({
    entryPoint,
    publicDir: stagingDir,
    webpackOverride: (config) => config
  });
  if (stagingDir) {
    await fs.rm(stagingDir, { recursive: true, force: true });
  }
  const inputProps = {
    title: input.title,
    hook: input.hook,
    beats: input.beats ?? [],
    tags: input.tags ?? [],
    bgm: input.bgm,
    platform: input.platform,
    durationSec: input.durationSec,
    subtitleCues: input.subtitleCues,
    broll
  };
  const composition = await selectComposition({
    serveUrl: bundleLocation,
    id: compositionId,
    inputProps
  });

  await renderMedia({
    composition,
    serveUrl: bundleLocation,
    codec: "h264",
    outputLocation: renderOutputPath,
    inputProps
  });

  if (input.bgmPath) {
    await mixBackgroundMusic({
      videoPath: renderOutputPath,
      bgmPath: input.bgmPath,
      outputPath,
      bgmVolume: input.bgmVolume
    });
    await fs.rm(renderOutputPath, { force: true });
  }

  return {
    outputPath,
    compositionId,
    bundleLocation,
    bgmPath: input.bgmPath,
    bgmVolume: input.bgmPath ? input.bgmVolume ?? 0.18 : undefined
  };
}
