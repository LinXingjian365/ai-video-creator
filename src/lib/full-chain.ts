import type { LLMClient } from "@/lib/llm/client";
import { renderNarratedPackage } from "@/lib/narrated-render";
import {
  renderPlatformVariants,
  type PlatformVariantId,
  type PlatformVariantManifest,
  type PlatformVariantMode
} from "@/lib/platform-variants";
import { renderScriptPackage, type RemotionAspectRatio, type RemotionRenderInput } from "@/lib/remotion-render";
import { generateScript, type ScriptDraft } from "@/lib/script/generate";
import type { TtsProvider } from "@/lib/tts/synthesize";

export interface FullChainInput {
  topic: string;
  platform?: string;
  audience?: string;
  durationSec?: number;
  references?: string[];
  aspectRatio?: RemotionAspectRatio;
  variantTargets?: PlatformVariantId[];
  variantMode?: PlatformVariantMode;
  narrated?: boolean;
  ttsProvider?: TtsProvider;
  voice?: string;
}

export interface FullChainNarration {
  provider: TtsProvider;
  voice: string;
  durationSec: number;
  audioPath: string;
}

export interface FullChainResult {
  topic: string;
  draft: ScriptDraft;
  packageVideoPath: string;
  variants: PlatformVariantManifest;
  narration?: FullChainNarration;
}

export interface FullChainDeps {
  generateScript: typeof generateScript;
  renderScriptPackage: typeof renderScriptPackage;
  renderNarratedPackage: typeof renderNarratedPackage;
  renderPlatformVariants: typeof renderPlatformVariants;
  onLog?: (message: string) => void;
  onProgress?: (progress: number) => void;
}

const defaultDeps: Pick<
  FullChainDeps,
  "generateScript" | "renderScriptPackage" | "renderNarratedPackage" | "renderPlatformVariants"
> = {
  generateScript,
  renderScriptPackage,
  renderNarratedPackage,
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
  const { generateScript, renderScriptPackage, renderNarratedPackage, renderPlatformVariants, onLog, onProgress } = {
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
  let packageVideoPath: string;
  let narration: FullChainNarration | undefined;
  if (input.narrated) {
    onLog?.(`② 合成 AI 配音 + 渲染成片:${title}`);
    const narrated = await renderNarratedPackage({
      title,
      hook: draft.hook,
      beats: draft.beats,
      tags: draft.tags,
      bgm: draft.bgm,
      platform,
      aspectRatio,
      ttsProvider: input.ttsProvider,
      voice: input.voice
    });
    packageVideoPath = narrated.videoPath;
    narration = {
      provider: narrated.provider,
      voice: narrated.voice,
      durationSec: narrated.durationSec,
      audioPath: narrated.narrationPath
    };
    onLog?.(`   配音:${narrated.provider}/${narrated.voice}, ${narrated.durationSec.toFixed(1)}s`);
  } else {
    onLog?.(`② 渲染 Remotion 成片:${title}`);
    const render = await renderScriptPackage(scriptDraftToRenderInput(draft, { title, platform, aspectRatio }));
    packageVideoPath = render.outputPath;
  }

  onProgress?.(60);
  onLog?.("③ 生成多平台变体");
  const variants = await renderPlatformVariants({
    inputPath: packageVideoPath,
    title,
    targets: input.variantTargets,
    mode: input.variantMode,
    onLog,
    onProgress: (progress) => onProgress?.(60 + Math.round((progress / 100) * 40))
  });

  onProgress?.(100);
  return { topic: input.topic, draft, packageVideoPath, variants, narration };
}
