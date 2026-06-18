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
