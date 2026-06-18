import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import type { MaterialAnalysis } from "@/lib/materials/analysis";

export interface BrollClip {
  src: string;          // 源引用:file://、http(s) 或暂存后的 staticFile 相对 key
  startSec: number;     // 在成片时间轴上的起点
  endSec: number;       // 在成片时间轴上的终点
  clipStartSec?: number; // 从源视频的哪一秒开始播(默认 0)
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

// 本地绝对路径转 file:// URL(Windows 反斜杠直接喂 OffthreadVideo 会失败);已是 URL 的原样返回。
export function toClipUrl(pathOrUrl: string): string {
  if (/^[a-z]+:\/\//i.test(pathOrUrl)) {
    return pathOrUrl;
  }
  return pathToFileURL(pathOrUrl).href;
}

// 把多个素材片段平均铺在 [0, durationSec] 上, 顺序垫在文字层背后。
export function planBrollFromClips(clipPaths: string[], durationSec: number): BrollClip[] {
  const clips = clipPaths.filter((value) => value && value.trim());
  if (clips.length === 0 || durationSec <= 0) {
    return [];
  }
  const slice = durationSec / clips.length;
  return clips.map((clipPath, index) => ({
    src: toClipUrl(clipPath),
    startSec: round2(index * slice),
    endSec: round2(index === clips.length - 1 ? durationSec : (index + 1) * slice)
  }));
}

// 从一条素材的分析结果取单个源视频, 用候选片段(或语音区间)的起点做"跳切"取景,
// 顺序铺满成片时长 —— 单素材也能产生画面变化。无候选则整段铺一个片段。
export function planBrollFromAnalysis(
  analysis: Pick<MaterialAnalysis, "media" | "candidates" | "audio">,
  durationSec: number,
  maxClips = 6
): BrollClip[] {
  const source = analysis.media?.primaryVideoPath;
  if (!source || durationSec <= 0) {
    return [];
  }
  const url = toClipUrl(source);
  const windows = analysis.candidates?.length ? analysis.candidates : analysis.audio?.speechRanges ?? [];
  const picked = windows.slice(0, Math.max(1, maxClips));
  if (picked.length === 0) {
    return [{ src: url, startSec: 0, endSec: round2(durationSec), clipStartSec: 0 }];
  }
  const slice = durationSec / picked.length;
  return picked.map((window, index) => ({
    src: url,
    startSec: round2(index * slice),
    endSec: round2(index === picked.length - 1 ? durationSec : (index + 1) * slice),
    clipStartSec: round2((window.startMs ?? 0) / 1000)
  }));
}

// Remotion compositor 只收 http(s),不接受 file://(见 OffthreadVideo proxy)。
// 渲染前把本地源拷进 publicDir/broll,回写 src 为 staticFile 相对 key;http(s) 源原样保留。
// 同一素材的多段切片复用同一份拷贝。
export async function stageBrollAssets(clips: BrollClip[], publicDir: string): Promise<BrollClip[]> {
  if (clips.length === 0) {
    return [];
  }
  const brollDir = path.join(publicDir, "broll");
  await fs.mkdir(brollDir, { recursive: true });
  const copied = new Map<string, string>();
  const staged: BrollClip[] = [];
  for (const clip of clips) {
    if (/^https?:\/\//i.test(clip.src)) {
      staged.push(clip);
      continue;
    }
    const sourcePath = clip.src.startsWith("file:") ? fileURLToPath(clip.src) : clip.src;
    let relKey = copied.get(sourcePath);
    if (!relKey) {
      const ext = path.extname(sourcePath) || ".mp4";
      const safe = path.basename(sourcePath, ext).replace(/[^a-zA-Z0-9_-]/g, "_") || "clip";
      const name = `${copied.size}-${safe}${ext}`;
      await fs.copyFile(sourcePath, path.join(brollDir, name));
      relKey = `broll/${name}`;
      copied.set(sourcePath, relKey);
    }
    staged.push({ ...clip, src: relKey });
  }
  return staged;
}
