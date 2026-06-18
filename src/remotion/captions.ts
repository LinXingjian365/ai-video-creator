export interface CaptionCue {
  index: number;
  caption: string;
  fromFrame: number;
  toFrame: number;
}

export interface CaptionBeat {
  time?: string;
  shot?: string;
  voiceover?: string;
  caption?: string;
}

function parseTimeToken(token: string): number | null {
  const cleaned = token.trim().replace(/[s秒]/gi, "");
  if (!cleaned) {
    return null;
  }
  if (cleaned.includes(":")) {
    const parts = cleaned.split(":").map((part) => Number(part));
    if (parts.some((part) => !Number.isFinite(part))) {
      return null;
    }
    return parts.reduce((acc, value) => acc * 60 + value, 0);
  }
  const value = Number(cleaned);
  return Number.isFinite(value) ? value : null;
}

// 解析脚本节拍的时间区间, 支持 "0-3s" / "3-18s" / "0:03-0:18" 等写法
export function parseBeatTime(time?: string): { start: number; end: number } | null {
  if (!time) {
    return null;
  }
  const parts = time.split(/[-~–—]/);
  if (parts.length !== 2) {
    return null;
  }
  const start = parseTimeToken(parts[0]);
  const end = parseTimeToken(parts[1]);
  if (start === null || end === null || end <= start) {
    return null;
  }
  return { start, end };
}

// 按脚本节拍的相对时长权重切分总帧数; 时间标注解析失败时退化为均分。
// 这样脚本计划时长与实际(TTS)成片时长不一致时, 字幕仍按节奏比例对齐。
export function buildCaptionCues(beats: CaptionBeat[], durationInFrames: number): CaptionCue[] {
  if (beats.length === 0) {
    return [];
  }
  const total = Math.max(1, Math.round(durationInFrames));

  const spans = beats.map((beat) => parseBeatTime(beat.time));
  const useSpans = spans.every((span) => span !== null);
  const weights = useSpans
    ? spans.map((span) => Math.max(0.0001, span!.end - span!.start))
    : beats.map(() => 1);
  const weightSum = weights.reduce((acc, weight) => acc + weight, 0);

  let acc = 0;
  return beats.map((beat, index) => {
    const fromFrame = Math.round((acc / weightSum) * total);
    acc += weights[index];
    const toFrame = index === beats.length - 1 ? total : Math.round((acc / weightSum) * total);
    return {
      index,
      caption: (beat.caption || beat.voiceover || beat.shot || "").trim(),
      fromFrame,
      toFrame: Math.max(fromFrame + 1, toFrame)
    };
  });
}

export function activeCueIndex(cues: CaptionCue[], frame: number): number {
  if (cues.length === 0) {
    return -1;
  }
  const found = cues.findIndex((cue) => frame >= cue.fromFrame && frame < cue.toFrame);
  if (found !== -1) {
    return found;
  }
  return frame < cues[0].fromFrame ? 0 : cues.length - 1;
}

// 把带真实起止秒的字幕段(来自 edge-tts 字幕)转成帧窗口, 用于配音版字幕精确对齐。
export function cuesFromTimings(
  timings: Array<{ text: string; startSec: number; endSec: number }>,
  durationInFrames: number,
  fps: number
): CaptionCue[] {
  const total = Math.max(1, Math.round(durationInFrames));
  const cues: CaptionCue[] = [];
  for (const timing of timings) {
    const caption = timing.text.trim();
    if (!caption) {
      continue;
    }
    const fromFrame = Math.min(total - 1, Math.max(0, Math.round(timing.startSec * fps)));
    const toFrame = Math.min(total, Math.max(fromFrame + 1, Math.round(timing.endSec * fps)));
    cues.push({ index: cues.length, caption, fromFrame, toFrame });
  }
  return cues;
}

// 把一句文本按标点切成 <= maxChars 的短块(标点跟随前段);单段仍超长则按长度硬切。
export function splitTextIntoChunks(text: string, maxChars: number): string[] {
  const clean = text.trim();
  if (clean.length <= maxChars) {
    return clean ? [clean] : [];
  }
  const pieces = clean
    .split(/(?<=[，。！？；、,.!?;])/)
    .map((piece) => piece.trim())
    .filter(Boolean);
  const chunks: string[] = [];
  let current = "";
  for (const piece of pieces) {
    if (piece.length > maxChars) {
      if (current) {
        chunks.push(current);
        current = "";
      }
      for (let i = 0; i < piece.length; i += maxChars) {
        chunks.push(piece.slice(i, i + maxChars));
      }
      continue;
    }
    if ((current + piece).length > maxChars) {
      if (current) {
        chunks.push(current);
      }
      current = piece;
    } else {
      current += piece;
    }
  }
  if (current) {
    chunks.push(current);
  }
  return chunks.length > 0 ? chunks : [clean];
}

// 把长字幕段切成短块, 在原段时间窗内按字数比例分配, 让长句像真短视频一样逐句蹦出。
export function chunkCaptionCues(cues: CaptionCue[], maxChars: number): CaptionCue[] {
  const result: CaptionCue[] = [];
  for (const cue of cues) {
    const chunks = splitTextIntoChunks(cue.caption, maxChars);
    if (chunks.length <= 1) {
      result.push({ ...cue, index: result.length });
      continue;
    }
    const span = cue.toFrame - cue.fromFrame;
    const totalChars = chunks.reduce((acc, chunk) => acc + chunk.length, 0);
    let acc = 0;
    for (const chunk of chunks) {
      const fromFrame = cue.fromFrame + Math.round((acc / totalChars) * span);
      acc += chunk.length;
      const toFrame = cue.fromFrame + Math.round((acc / totalChars) * span);
      result.push({ index: result.length, caption: chunk, fromFrame, toFrame: Math.max(fromFrame + 1, toFrame) });
    }
  }
  return result;
}
