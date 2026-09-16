export interface SubtitleCue {
  text: string;
  startSec: number;
  endSec: number;
}

// 解析 SRT/VTT 时间戳: 00:00:03,162 或 00:00:03.162
function parseTimestamp(raw: string): number | null {
  const match = raw.trim().match(/^(\d{1,2}):(\d{2}):(\d{2})[,.](\d{1,3})$/);
  if (!match) {
    return null;
  }
  const [, hh, mm, ss, ms] = match;
  return Number(hh) * 3600 + Number(mm) * 60 + Number(ss) + Number(ms.padEnd(3, "0")) / 1000;
}

// 解析 edge-tts 产出的字幕(SRT 结构, 句级时间轴), 返回带真实起止秒的字幕段。
export function parseSrt(content: string): SubtitleCue[] {
  const blocks = content.replace(/\r\n/g, "\n").split(/\n\s*\n/);
  const cues: SubtitleCue[] = [];
  for (const block of blocks) {
    const lines = block.split("\n").map((line) => line.trim()).filter(Boolean);
    const arrowIndex = lines.findIndex((line) => line.includes("-->"));
    if (arrowIndex === -1) {
      continue;
    }
    const [startRaw, endRaw] = lines[arrowIndex].split("-->");
    const startSec = parseTimestamp(startRaw ?? "");
    const endSec = parseTimestamp(endRaw ?? "");
    if (startSec === null || endSec === null || endSec <= startSec) {
      continue;
    }
    const text = lines.slice(arrowIndex + 1).join(" ").trim();
    if (!text) {
      continue;
    }
    cues.push({ text, startSec, endSec });
  }
  return cues;
}
