import fs from "node:fs/promises";
import path from "node:path";
import { bundle } from "@remotion/bundler";
import { renderMedia, selectComposition } from "@remotion/renderer";
import { outputRoot, resolveLocalPath } from "@/lib/paths";
import type { ScriptPackageProps } from "@/remotion/ScriptPackage";

export type RemotionAspectRatio = "9:16" | "16:9";

export interface RemotionRenderInput extends Partial<ScriptPackageProps> {
  aspectRatio: RemotionAspectRatio;
  outputPath?: string;
}

export interface RemotionRenderResult {
  outputPath: string;
  compositionId: string;
  bundleLocation: string;
}

export async function renderScriptPackage(input: RemotionRenderInput): Promise<RemotionRenderResult> {
  const compositionId = input.aspectRatio === "16:9" ? "ScriptPackageWide" : "ScriptPackageVertical";
  const outputPath = resolveLocalPath(
    input.outputPath ?? path.join(outputRoot, "remotion", `${Date.now()}-script-package.mp4`)
  );
  await fs.mkdir(path.dirname(outputPath), { recursive: true });

  const entryPoint = path.join(process.cwd(), "src", "remotion", "index.ts");
  const bundleLocation = await bundle({
    entryPoint,
    webpackOverride: (config) => config
  });
  const inputProps = {
    title: input.title,
    hook: input.hook,
    beats: input.beats ?? [],
    tags: input.tags ?? [],
    bgm: input.bgm,
    platform: input.platform,
    durationSec: input.durationSec
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
    outputLocation: outputPath,
    inputProps
  });

  return { outputPath, compositionId, bundleLocation };
}
