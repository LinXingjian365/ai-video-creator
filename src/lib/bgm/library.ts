// 本地 BGM 库 + 选曲器
// 设计原则:
// 1. 核心打分函数纯计算,不碰文件系统;扫描和打分分离方便测试
// 2. mood 输入既可以是用户手写情绪词,也可以是 LLM 在 ScriptDraft.bgm 里的整段建议
// 3. 库为空或无匹配时返回 null + 明确 nextActions,绝不静默挑随机文件冒充"AI 选曲"

import fs from "node:fs/promises";
import path from "node:path";
import { workspaceRoot } from "@/lib/paths";

export interface BgmEntry {
  relativePath: string;       // 相对 workspace 根, 如 "workspace/input/audio/uplifting/sora-tech.mp3"
  fileName: string;
  moodTags: string[];         // 从目录名 + 文件名提取
  durationHintSec?: number;   // 未来扩展(ffprobe);现版不强制
}

export interface PickBgmOptions {
  fallbackFirst?: boolean;    // 完全无匹配时是否退化为按字母序首个;默认 false(诚实返回 null)
}

export interface PickBgmResult {
  pick: BgmEntry | null;
  score: number;              // 命中分,匹配关键词数;无匹配为 0
  matchedKeywords: string[];  // 实际命中的词
  rankings: Array<{ entry: BgmEntry; score: number; matched: string[] }>;
  nextActions: string[];
}

const AUDIO_EXTENSIONS = new Set([".mp3", ".wav", ".m4a", ".ogg", ".flac", ".aac"]);

// 把任意中英文混合的情绪描述,拆成可匹配的关键词列表
// 同义词归一化到代表词(uplifting/calm/tech/...)避免规模膨胀
const MOOD_SYNONYMS: Record<string, string[]> = {
  uplifting: ["uplifting", "upbeat", "happy", "energetic", "轻快", "欢快", "活力", "动感", "明快", "鼓舞"],
  calm: ["calm", "ambient", "chill", "soft", "peaceful", "舒缓", "安静", "平静", "治愈", "氛围"],
  tech: ["tech", "futuristic", "electronic", "synth", "cyber", "edm", "科技", "电子", "未来", "合成器", "数字"],
  cinematic: ["cinematic", "epic", "orchestral", "dramatic", "电影", "史诗", "管弦", "宏大", "戏剧"],
  warm: ["warm", "acoustic", "guitar", "piano", "folk", "温暖", "原声", "吉他", "钢琴", "民谣"],
  dark: ["dark", "tense", "suspense", "thriller", "黑暗", "紧张", "悬疑", "惊悚"],
  funny: ["funny", "quirky", "playful", "cartoon", "搞笑", "俏皮", "鬼畜", "卡通"]
};

export function deriveMoodKeywords(input: string): string[] {
  const lower = input.toLowerCase();
  const hits = new Set<string>();
  for (const [canonical, words] of Object.entries(MOOD_SYNONYMS)) {
    if (words.some((word) => lower.includes(word.toLowerCase()))) {
      hits.add(canonical);
    }
  }
  // 也把输入里出现的原词当作额外关键词(支持自定义曲风,如"国风"/"city-pop")
  const raw = lower
    .split(/[\s,，、;；\/\\(){}[\]"'·。.]+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 2 && token.length <= 16);
  for (const token of raw) {
    hits.add(token);
  }
  return [...hits];
}

export function tagsFromPath(relativePath: string): string[] {
  const parts = relativePath.split(/[\\/]+/);
  const stem = path.basename(relativePath, path.extname(relativePath));
  const segments: string[] = [];
  for (const part of parts.slice(0, -1)) {
    if (part && part !== "workspace" && part !== "input" && part !== "audio") {
      segments.push(part.toLowerCase());
    }
  }
  // 拆文件名:用 - _ . 空格分,数字段丢弃
  const stemTokens = stem
    .toLowerCase()
    .split(/[-_.\s]+/)
    .filter((token) => token.length >= 2 && !/^\d+$/.test(token));
  const all = new Set<string>([...segments, ...stemTokens]);
  // 归一化:把同义词替换为代表词(目录"uplifting"和"upbeat"统一成 uplifting)
  const normalized = new Set<string>();
  for (const tag of all) {
    let canonical: string | undefined;
    for (const [head, words] of Object.entries(MOOD_SYNONYMS)) {
      if (words.includes(tag) || head === tag) {
        canonical = head;
        break;
      }
    }
    normalized.add(canonical ?? tag);
  }
  return [...normalized];
}

export function scoreEntry(entry: BgmEntry, moodKeywords: string[]): { score: number; matched: string[] } {
  if (moodKeywords.length === 0 || entry.moodTags.length === 0) {
    return { score: 0, matched: [] };
  }
  const matched: string[] = [];
  for (const keyword of moodKeywords) {
    if (entry.moodTags.includes(keyword)) {
      matched.push(keyword);
    }
  }
  return { score: matched.length, matched };
}

export function pickBgm(
  library: BgmEntry[],
  mood: string,
  options: PickBgmOptions = {}
): PickBgmResult {
  const moodKeywords = deriveMoodKeywords(mood);
  if (library.length === 0) {
    return {
      pick: null,
      score: 0,
      matchedKeywords: [],
      rankings: [],
      nextActions: [
        "BGM library is empty. Drop some royalty-free mp3/wav into workspace/input/audio (CC0 sources: pixabay.com/music, mixkit.co, freepd.com)."
      ]
    };
  }
  const rankings = library
    .map((entry) => {
      const { score, matched } = scoreEntry(entry, moodKeywords);
      return { entry, score, matched };
    })
    // 确定性:先按分数降序,再按相对路径字典序(避免随机)
    .sort((a, b) => (b.score - a.score) || a.entry.relativePath.localeCompare(b.entry.relativePath));

  const top = rankings[0];
  if (!top || top.score === 0) {
    if (options.fallbackFirst) {
      const first = library.slice().sort((a, b) => a.relativePath.localeCompare(b.relativePath))[0];
      return {
        pick: first,
        score: 0,
        matchedKeywords: [],
        rankings,
        nextActions: [`No keyword match for "${mood}"; fell back to first by name. Consider adding mood-tagged files for better picks.`]
      };
    }
    return {
      pick: null,
      score: 0,
      matchedKeywords: [],
      rankings,
      nextActions: [
        `No BGM matches mood "${mood}". Derived keywords: [${moodKeywords.join(", ")}]. Either tag files via folder names (e.g. workspace/input/audio/uplifting/) or pass fallbackFirst=true.`
      ]
    };
  }
  return {
    pick: top.entry,
    score: top.score,
    matchedKeywords: top.matched,
    rankings,
    nextActions: [
      `Selected ${top.entry.relativePath} on ${top.score} keyword match(es): [${top.matched.join(", ")}].`
    ]
  };
}

// 扫描磁盘:递归遍历 audioRoot,产 BgmEntry[];默认从 workspace/input/audio 开始
export async function scanBgmLibrary(audioRoot?: string): Promise<BgmEntry[]> {
  const root = audioRoot ?? path.join(workspaceRoot, "input", "audio");
  const entries: BgmEntry[] = [];
  await walk(root, root, entries);
  return entries.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
}

async function walk(root: string, current: string, out: BgmEntry[]): Promise<void> {
  let dirents;
  try {
    dirents = await fs.readdir(current, { withFileTypes: true });
  } catch {
    return; // 目录不存在时返回空库,不抛错
  }
  for (const dirent of dirents) {
    const full = path.join(current, dirent.name);
    if (dirent.isDirectory()) {
      await walk(root, full, out);
      continue;
    }
    if (!dirent.isFile()) {
      continue;
    }
    const ext = path.extname(dirent.name).toLowerCase();
    if (!AUDIO_EXTENSIONS.has(ext)) {
      continue;
    }
    const relativeFromCwd = path.relative(process.cwd(), full).replace(/\\/g, "/");
    out.push({
      relativePath: relativeFromCwd,
      fileName: dirent.name,
      moodTags: tagsFromPath(path.relative(root, full).replace(/\\/g, "/"))
    });
  }
}
