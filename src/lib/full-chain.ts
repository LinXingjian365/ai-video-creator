import type { LLMClient } from "@/lib/llm/client";
import {
  renderPlatformVariants,
  type PlatformVariantId,
  type PlatformVariantManifest,
  type PlatformVariantMode
} from "@/lib/platform-variants";
import { renderScriptPackage, type RemotionAspectRatio, type RemotionRenderInput } from "@/lib/remotion-render";
import { generateScript, type ScriptDraft } from "@/lib/script/generate";

export interface FullChainInput {
  topic: string;
  platform?: string;
  audience?: string;
  durationSec?: number;
  references?: string[];
  aspectRatio?: RemotionAspectRatio;
  variantTargets?: PlatformVariantId[];
  variantMode?: PlatformVariantMode;
}

export interface FullChainResult {
  topic: string;
  draft: ScriptDraft;
  packageVideoPath: string;
  variants: PlatformVariantManifest;
}

export interface FullChainDeps {
  generateScript: typeof generateScript;
  renderScriptPackage: typeof renderScriptPackage;
  renderPlatformVariants: typeof renderPlatformVariants;
  onLog?: (message: string) => void;
  onProgress?: (progress: number) => void;
}

const defaultDeps: Pick<FullChainDeps, "generateScript" | "renderScriptPackage" | "renderPlatformVariants"> = {
  generateScript,
  renderScriptPackage,
  renderPlatformVariants
};

export function pickTitle(draft: ScriptDraft, fallback: string): string {
  const title = draft.titles.find((candidate) => candidate && candidate.trim());
  return title?.trim() || fallback;
}

export function scriptDraftToRenderInput(
  draft: ScriptDraft,
  opts: { title: string; platform?: string; aspectRatio: RemotionAspectRatio; outputPath?: string }
): RemotionRenderInput {
  return {
    aspectRatio: opts.aspectRatio,
    title: opts.title,
    hook: draft.hook,
    beats: draft.beats,
    tags: draft.tags,
    bgm: draft.bgm,
    platform: opts.platform,
    outputPath: opts.outputPath
  };
}

export async function runFullChain(
  input: FullChainInput,
  client: LLMClient,
  deps: Partial<FullChainDeps> = {}
): Promise<FullChainResult> {
  const { generateScript, renderScriptPackage, renderPlatformVariants, onLog, onProgress } = {
    ...defaultDeps,
    ...deps
  };
  const platform = input.platform ?? "douyin";
  const aspectRatio = input.aspectRatio ?? "9:16";

  onProgress?.(5);
  onLog?.("① 生成文案脚本");
  const draft = await generateScript(
    {
      topic: input.topic,
      platform,
      audience: input.audience,
      durationSec: input.durationSec,
      references: input.references
    },
    client
  );
  const title = pickTitle(draft, input.topic);

  onProgress?.(35);
  onLog?.(`② 渲染 Remotion 成片:${title}`);
  const render = await renderScriptPackage(scriptDraftToRenderInput(draft, { title, platform, aspectRatio }));

  onProgress?.(60);
  onLog?.("③ 生成多平台变体");
  const variants = await renderPlatformVariants({
    inputPath: render.outputPath,
    title,
    targets: input.variantTargets,
    mode: input.variantMode,
    onLog,
    onProgress: (progress) => onProgress?.(60 + Math.round((progress / 100) * 40))
  });

  onProgress?.(100);
  return { topic: input.topic, draft, packageVideoPath: render.outputPath, variants };
}
