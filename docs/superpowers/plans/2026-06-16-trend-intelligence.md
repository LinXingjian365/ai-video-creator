# 热点情报大脑 (S1) 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把假模板换成真东西——抓 B站分区排行榜真实数据 → 确定性打分排序 → LLM 解释爆火逻辑并生成可模仿选题卡 → 产出按需"热点情报报告"。

**Architecture:** 可插拔数据源(`TrendSource` 接口,B站先行,后续抖音/YT 只加适配器)→ 纯函数打分器(真实互动数据驱动,杜绝幻觉)→ provider 可插拔的 LLM 客户端(GPT 优先,OpenAI 兼容)做分析(只解释不编数)→ 组装报告。失败诚实降级,绝不造假。

**Tech Stack:** Next.js 15 App Router、TypeScript、zod、vitest(新增测试框架)、B站公开 API、OpenAI 兼容 Chat Completions。

参考 spec:`docs/superpowers/specs/2026-06-16-trend-intelligence-design.md`

---

## 文件结构

新增:
- `src/lib/trend/types.ts` — 平台无关类型(TrendItem/TrendSource/ScoredItem/IntelligenceReport 等)
- `src/lib/trend/scorer.ts` — 纯函数:信号计算 + 潜力分 + 置信度
- `src/lib/trend/sources/bilibili.ts` — B站排行榜适配器(纯映射 + 联网抓取)
- `src/lib/llm/client.ts` — provider 可插拔 LLM 客户端(GPT 优先)
- `src/lib/trend/analyst.ts` — LLM 分析(prompt 构造 + 响应解析)
- `src/lib/trend/report.ts` — 编排 + 组装(含降级)
- `src/app/api/trend/report/route.ts` — API 路由
- 各 `*.test.ts` 测试

修改:
- `src/lib/schemas.ts` — 新增 `trendReportSchema`
- `src/lib/tasks.ts:5` — TaskType 加 `"trend-report"`
- `src/app/api/creator/readiness/route.ts` — 体检加 LLM 配置
- `.env.example` — 新增 LLM 相关 env
- `src/app/page.tsx` — trend/predict 标签接真报告
- `package.json` — 加 vitest + test 脚本

---

## Task 1: 搭建 vitest 测试框架

**Files:**
- Modify: `package.json`
- Create: `vitest.config.ts`

- [ ] **Step 1: 安装 vitest**

Run: `npm install -D vitest`
Expected: 安装成功,package.json devDependencies 出现 vitest

- [ ] **Step 2: 加 test 脚本**

修改 `package.json` 的 scripts,加一行:

```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 3: 创建 vitest 配置**

Create `vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "src") },
  },
});
```

- [ ] **Step 4: 冒烟测试**

Create `src/lib/trend/_smoke.test.ts`:

```ts
import { describe, it, expect } from "vitest";
describe("vitest", () => { it("runs", () => { expect(1 + 1).toBe(2); }); });
```

Run: `npm test`
Expected: PASS,1 个测试通过

- [ ] **Step 5: 删除冒烟测试并提交**

```bash
rm src/lib/trend/_smoke.test.ts
git add package.json package-lock.json vitest.config.ts
git commit -m "chore: 引入 vitest 测试框架"
```

---

## Task 2: 平台无关类型

**Files:**
- Create: `src/lib/trend/types.ts`

类型本身无运行时行为,不写单测;由后续 Task 的导入与编译验证。

- [ ] **Step 1: 创建 types.ts**

```ts
export type Platform = "bilibili" | "douyin" | "youtube";

export interface TrendMetrics {
  views: number;
  likes: number;
  coins?: number;       // B站特有
  favorites: number;
  shares: number;
  comments: number;
  danmaku?: number;     // B站特有
}

export interface TrendItem {
  platform: Platform;
  id: string;
  title: string;
  author: string;
  authorId: string;
  category: string;
  tags: string[];
  url: string;
  thumbnail: string;
  publishedAt: string;  // ISO 8601
  durationSec: number;
  metrics: TrendMetrics;
}

export interface TrendSource {
  readonly platform: Platform;
  fetchTrends(opts: { category: string; topN: number }): Promise<TrendItem[]>;
}

export interface SignalSet {
  engagementRate: number;
  velocity: number;
  danmakuDensity?: number;
  commentRate: number;
}

export interface ScoredItem extends TrendItem {
  signals: SignalSet;
  potentialScore: number;  // 0-100
  confidence: number;      // 0-100, 数据支撑强度(非"会火概率")
}

export interface TopicCard {
  angle: string;
  hook: string;
  structure: string;
  refItemIds: string[];
}

export interface ReportItem extends ScoredItem {
  viralLogic: string;      // 来自 LLM, 降级时为空串
}

export interface IntelligenceReport {
  platform: Platform;
  category: string;
  generatedAt: string;
  itemCount: number;
  items: ReportItem[];
  patterns: string[];
  topicCards: TopicCard[];
  aiStatus: "ok" | "failed";
}
```

- [ ] **Step 2: 编译校验并提交**

Run: `npm run typecheck`
Expected: 无新增错误

```bash
git add src/lib/trend/types.ts
git commit -m "feat(trend): 平台无关类型定义"
```

---

## Task 3: 打分器(纯函数,TDD)

**Files:**
- Create: `src/lib/trend/scorer.ts`
- Test: `src/lib/trend/scorer.test.ts`

- [ ] **Step 1: 写失败测试**

Create `src/lib/trend/scorer.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { computeSignals, computeConfidence, scoreItems } from "./scorer";
import type { TrendItem } from "./types";

const NOW = Date.parse("2026-06-16T12:00:00Z");

function item(over: Partial<TrendItem> = {}): TrendItem {
  return {
    platform: "bilibili", id: "bv1", title: "t", author: "a", authorId: "1",
    category: "游戏", tags: [], url: "u", thumbnail: "p",
    publishedAt: "2026-06-16T00:00:00Z", durationSec: 60,
    metrics: { views: 1000, likes: 100, coins: 50, favorites: 30, shares: 20, comments: 10, danmaku: 200 },
    ...over,
  };
}

describe("computeSignals", () => {
  it("互动率=(赞+币+藏+转)/播放", () => {
    const s = computeSignals(item(), NOW);
    expect(s.engagementRate).toBeCloseTo((100 + 50 + 30 + 20) / 1000);
  });
  it("涨速=播放/上线小时, 发布12h前", () => {
    const s = computeSignals(item(), NOW);
    expect(s.velocity).toBeCloseTo(1000 / 12);
  });
  it("弹幕密度=弹幕/播放", () => {
    expect(computeSignals(item(), NOW).danmakuDensity).toBeCloseTo(200 / 1000);
  });
  it("播放为0时不除零", () => {
    const s = computeSignals(item({ metrics: { views: 0, likes: 0, favorites: 0, shares: 0, comments: 0 } }), NOW);
    expect(Number.isFinite(s.engagementRate)).toBe(true);
  });
});

describe("computeConfidence", () => {
  it("数据齐全且新鲜 → 高分", () => {
    expect(computeConfidence(item(), NOW)).toBeGreaterThan(80);
  });
  it("数据缺失 → 降低", () => {
    const sparse = item({ metrics: { views: 1000, likes: 0, favorites: 0, shares: 0, comments: 0 } });
    expect(computeConfidence(sparse, NOW)).toBeLessThan(computeConfidence(item(), NOW));
  });
});

describe("scoreItems", () => {
  it("按潜力分降序排列", () => {
    const high = item({ id: "high", metrics: { views: 1000, likes: 900, coins: 0, favorites: 0, shares: 0, comments: 0, danmaku: 0 } });
    const low = item({ id: "low", metrics: { views: 1000, likes: 1, coins: 0, favorites: 0, shares: 0, comments: 0, danmaku: 0 } });
    const out = scoreItems([low, high], NOW);
    expect(out[0].id).toBe("high");
    expect(out[0].potentialScore).toBeGreaterThanOrEqual(out[1].potentialScore);
  });
  it("每条带 signals/potentialScore/confidence", () => {
    const out = scoreItems([item()], NOW);
    expect(out[0]).toHaveProperty("potentialScore");
    expect(out[0]).toHaveProperty("confidence");
    expect(out[0].signals).toHaveProperty("engagementRate");
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npm test -- scorer`
Expected: FAIL,`computeSignals is not a function`(模块未实现)

- [ ] **Step 3: 实现 scorer.ts**

```ts
import type { TrendItem, ScoredItem, SignalSet } from "./types";

const HOUR_MS = 3_600_000;

export function computeSignals(item: TrendItem, nowMs: number): SignalSet {
  const m = item.metrics;
  const views = Math.max(m.views, 1);
  const interactions = m.likes + (m.coins ?? 0) + m.favorites + m.shares;
  const hours = Math.max((nowMs - Date.parse(item.publishedAt)) / HOUR_MS, 1);
  return {
    engagementRate: interactions / views,
    velocity: views / hours,
    danmakuDensity: m.danmaku !== undefined ? m.danmaku / views : undefined,
    commentRate: m.comments / views,
  };
}

// 置信度 = 数据支撑强度(完整度 + 新鲜度), 不是"会火的概率"
export function computeConfidence(item: TrendItem, nowMs: number): number {
  const m = item.metrics;
  const fields = [m.views, m.likes, m.favorites, m.shares, m.comments];
  const present = fields.filter((v) => typeof v === "number" && v > 0).length;
  const completeness = (present / fields.length) * 60;
  const hours = (nowMs - Date.parse(item.publishedAt)) / HOUR_MS;
  const freshness = hours >= 0 && hours <= 168 ? (1 - hours / 168) * 40 : 0;
  return Math.round(Math.min(completeness + freshness, 100));
}

function minMax(value: number, all: number[]): number {
  const mn = Math.min(...all);
  const mx = Math.max(...all);
  return mx === mn ? 0.5 : (value - mn) / (mx - mn);
}

export function scoreItems(items: TrendItem[], nowMs: number): ScoredItem[] {
  const withSignals = items.map((item) => ({ item, signals: computeSignals(item, nowMs) }));
  const engAll = withSignals.map((w) => w.signals.engagementRate);
  const velAll = withSignals.map((w) => w.signals.velocity);

  const scored = withSignals.map(({ item, signals }) => {
    const potentialScore = Math.round(
      (minMax(signals.engagementRate, engAll) * 0.6 + minMax(signals.velocity, velAll) * 0.4) * 100
    );
    return { ...item, signals, potentialScore, confidence: computeConfidence(item, nowMs) };
  });

  return scored.sort((a, b) => b.potentialScore - a.potentialScore);
}
```

- [ ] **Step 4: 运行确认通过**

Run: `npm test -- scorer`
Expected: PASS,全部测试通过

- [ ] **Step 5: 提交**

```bash
git add src/lib/trend/scorer.ts src/lib/trend/scorer.test.ts
git commit -m "feat(trend): 确定性打分器(信号/潜力分/置信度)"
```

---

## Task 4: B站数据源适配器

**Files:**
- Create: `src/lib/trend/sources/bilibili.ts`
- Test: `src/lib/trend/sources/bilibili.test.ts`

- [ ] **Step 1: 写失败测试(测纯映射函数)**

Create `src/lib/trend/sources/bilibili.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { mapRankingResponse, ridForCategory } from "./bilibili";

const fixture = {
  code: 0,
  data: {
    list: [
      {
        bvid: "BV1xx", aid: 111, title: "测试视频",
        owner: { name: "UP主", mid: 999 },
        stat: { view: 50000, danmaku: 800, reply: 300, favorite: 1200, coin: 600, share: 400, like: 3000 },
        duration: 245, pubdate: 1781568000, pic: "http://i0.hdslb.com/x.jpg", tname: "游戏",
      },
    ],
  },
};

describe("ridForCategory", () => {
  it("all → 0", () => expect(ridForCategory("all")).toBe(0));
  it("game → 4", () => expect(ridForCategory("game")).toBe(4));
  it("纯数字字符串原样转 rid", () => expect(ridForCategory("36")).toBe(36));
  it("未知分类回退 0", () => expect(ridForCategory("unknown")).toBe(0));
});

describe("mapRankingResponse", () => {
  it("映射成 TrendItem", () => {
    const items = mapRankingResponse(fixture);
    expect(items).toHaveLength(1);
    const it0 = items[0];
    expect(it0.platform).toBe("bilibili");
    expect(it0.id).toBe("BV1xx");
    expect(it0.author).toBe("UP主");
    expect(it0.url).toBe("https://www.bilibili.com/video/BV1xx");
    expect(it0.metrics.views).toBe(50000);
    expect(it0.metrics.coins).toBe(600);
    expect(it0.metrics.comments).toBe(300);
    expect(it0.metrics.danmaku).toBe(800);
    expect(it0.publishedAt).toBe(new Date(1781568000 * 1000).toISOString());
  });
  it("code 非 0 抛错", () => {
    expect(() => mapRankingResponse({ code: -412, data: null })).toThrow();
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npm test -- bilibili`
Expected: FAIL,模块未实现

- [ ] **Step 3: 实现 bilibili.ts**

```ts
import type { TrendItem, TrendSource } from "../types";

const RID_BY_CATEGORY: Record<string, number> = {
  all: 0, animation: 1, game: 4, knowledge: 36, life: 160,
  music: 3, tech: 188, movie: 23, dance: 129, food: 211,
};

export function ridForCategory(category: string): number {
  if (category in RID_BY_CATEGORY) return RID_BY_CATEGORY[category];
  const n = Number(category);
  return Number.isInteger(n) && n >= 0 ? n : 0;
}

interface RankingEntry {
  bvid: string; title: string;
  owner: { name: string; mid: number };
  stat: { view: number; danmaku: number; reply: number; favorite: number; coin: number; share: number; like: number };
  duration: number; pubdate: number; pic: string; tname?: string;
}

export function mapRankingResponse(raw: unknown): TrendItem[] {
  const r = raw as { code?: number; data?: { list?: RankingEntry[] } };
  if (!r || r.code !== 0 || !r.data?.list) {
    throw new Error(`B站排行榜返回异常: code=${r?.code}`);
  }
  return r.data.list.map((e) => ({
    platform: "bilibili" as const,
    id: e.bvid,
    title: e.title,
    author: e.owner?.name ?? "",
    authorId: String(e.owner?.mid ?? ""),
    category: e.tname ?? "",
    tags: [],
    url: `https://www.bilibili.com/video/${e.bvid}`,
    thumbnail: e.pic ?? "",
    publishedAt: new Date((e.pubdate ?? 0) * 1000).toISOString(),
    durationSec: e.duration ?? 0,
    metrics: {
      views: e.stat?.view ?? 0,
      likes: e.stat?.like ?? 0,
      coins: e.stat?.coin ?? 0,
      favorites: e.stat?.favorite ?? 0,
      shares: e.stat?.share ?? 0,
      comments: e.stat?.reply ?? 0,
      danmaku: e.stat?.danmaku ?? 0,
    },
  }));
}

const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
  Referer: "https://www.bilibili.com",
};

async function fetchRanking(rid: number, attempt = 0): Promise<unknown> {
  const url = `https://api.bilibili.com/x/web-interface/ranking/v2?rid=${rid}&type=all`;
  try {
    const res = await fetch(url, { headers: HEADERS });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (error) {
    if (attempt < 2) {
      await new Promise((r) => setTimeout(r, 500 * 2 ** attempt));
      return fetchRanking(rid, attempt + 1);
    }
    throw new Error(`B站排行榜抓取失败(rid=${rid}): ${error instanceof Error ? error.message : String(error)}`);
  }
}

export const bilibiliSource: TrendSource = {
  platform: "bilibili",
  async fetchTrends({ category, topN }) {
    const raw = await fetchRanking(ridForCategory(category));
    return mapRankingResponse(raw).slice(0, topN);
  },
};
```

- [ ] **Step 4: 运行确认通过**

Run: `npm test -- bilibili`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add src/lib/trend/sources/bilibili.ts src/lib/trend/sources/bilibili.test.ts
git commit -m "feat(trend): B站排行榜数据源适配器"
```

---

## Task 5: LLM 客户端(provider 可插拔, GPT 优先)

**Files:**
- Create: `src/lib/llm/client.ts`
- Test: `src/lib/llm/client.test.ts`

- [ ] **Step 1: 写失败测试(注入 fake fetch)**

Create `src/lib/llm/client.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";
import { createLLMClient } from "./client";

function fakeFetch(body: unknown) {
  return vi.fn(async () => ({ ok: true, status: 200, json: async () => body } as Response));
}

describe("createLLMClient (openai)", () => {
  it("默认 provider=openai, 调 {base}/chat/completions, 取 choices[0].message.content", async () => {
    const fetchMock = fakeFetch({ choices: [{ message: { content: "结果文本" } }] });
    const client = createLLMClient(
      { LLM_PROVIDER: "openai", OPENAI_API_KEY: "k", OPENAI_BASE_URL: "https://gw.test/v1", OPENAI_MODEL: "gpt-5.5" },
      fetchMock as unknown as typeof fetch
    );
    const out = await client.complete({ system: "s", prompt: "p" });
    expect(out).toBe("结果文本");
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://gw.test/v1/chat/completions");
    expect((init as RequestInit).headers).toMatchObject({ Authorization: "Bearer k" });
  });
  it("缺 key 抛错", () => {
    expect(() => createLLMClient({ LLM_PROVIDER: "openai" }, fetch)).toThrow();
  });
});

describe("createLLMClient (anthropic)", () => {
  it("provider=anthropic 调 {base}/v1/messages 取 content[0].text", async () => {
    const fetchMock = fakeFetch({ content: [{ text: "claude文本" }] });
    const client = createLLMClient(
      { LLM_PROVIDER: "anthropic", ANTHROPIC_API_KEY: "k", ANTHROPIC_BASE_URL: "https://anthropic.test", ANTHROPIC_MODEL: "claude-x" },
      fetchMock as unknown as typeof fetch
    );
    const out = await client.complete({ system: "s", prompt: "p" });
    expect(out).toBe("claude文本");
    expect(fetchMock.mock.calls[0][0]).toBe("https://anthropic.test/v1/messages");
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npm test -- llm`
Expected: FAIL,模块未实现

- [ ] **Step 3: 实现 client.ts**

```ts
export interface LLMClient {
  complete(opts: { system?: string; prompt: string }): Promise<string>;
}

type Env = Record<string, string | undefined>;

function openAiClient(env: Env, fetchImpl: typeof fetch): LLMClient {
  const key = env.OPENAI_API_KEY;
  if (!key) throw new Error("缺少 OPENAI_API_KEY");
  const base = (env.OPENAI_BASE_URL ?? "https://api.openai.com/v1").replace(/\/$/, "");
  const model = env.OPENAI_MODEL ?? "gpt-4o-mini";
  return {
    async complete({ system, prompt }) {
      const messages = [
        ...(system ? [{ role: "system", content: system }] : []),
        { role: "user", content: prompt },
      ];
      const res = await fetchImpl(`${base}/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
        body: JSON.stringify({ model, messages, temperature: 0.7 }),
      });
      if (!res.ok) throw new Error(`LLM HTTP ${res.status}`);
      const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
      const content = data.choices?.[0]?.message?.content;
      if (!content) throw new Error("LLM 返回为空");
      return content;
    },
  };
}

function anthropicClient(env: Env, fetchImpl: typeof fetch): LLMClient {
  const key = env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("缺少 ANTHROPIC_API_KEY");
  const base = (env.ANTHROPIC_BASE_URL ?? "https://api.anthropic.com").replace(/\/$/, "");
  const model = env.ANTHROPIC_MODEL ?? "claude-sonnet-4-6";
  return {
    async complete({ system, prompt }) {
      const res = await fetchImpl(`${base}/v1/messages`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": key,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model, max_tokens: 4096,
          ...(system ? { system } : {}),
          messages: [{ role: "user", content: prompt }],
        }),
      });
      if (!res.ok) throw new Error(`LLM HTTP ${res.status}`);
      const data = (await res.json()) as { content?: { text?: string }[] };
      const text = data.content?.[0]?.text;
      if (!text) throw new Error("LLM 返回为空");
      return text;
    },
  };
}

export function createLLMClient(env: Env = process.env, fetchImpl: typeof fetch = fetch): LLMClient {
  const provider = (env.LLM_PROVIDER ?? "openai").toLowerCase();
  return provider === "anthropic" ? anthropicClient(env, fetchImpl) : openAiClient(env, fetchImpl);
}

// 无可用配置时返回 null, 由上层降级
export function tryCreateLLMClient(env: Env = process.env): LLMClient | null {
  try {
    const provider = (env.LLM_PROVIDER ?? "openai").toLowerCase();
    if (provider === "anthropic" ? !env.ANTHROPIC_API_KEY : !env.OPENAI_API_KEY) return null;
    return createLLMClient(env);
  } catch {
    return null;
  }
}
```

- [ ] **Step 4: 运行确认通过**

Run: `npm test -- llm`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add src/lib/llm/client.ts src/lib/llm/client.test.ts
git commit -m "feat(llm): provider 可插拔 LLM 客户端(GPT 优先)"
```

---

## Task 6: 分析器(prompt + 解析)

**Files:**
- Create: `src/lib/trend/analyst.ts`
- Test: `src/lib/trend/analyst.test.ts`

- [ ] **Step 1: 写失败测试**

Create `src/lib/trend/analyst.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { parseAnalysis, analyzeTrends } from "./analyst";
import type { ScoredItem } from "./types";
import type { LLMClient } from "@/lib/llm/client";

const goodJson = JSON.stringify({
  items: [{ id: "BV1", viralLogic: "节奏快+卡点" }],
  patterns: ["前3秒高信息密度"],
  topicCards: [{ angle: "新手向", hook: "你也能", structure: "痛点-演示-CTA", refItemIds: ["BV1"] }],
});

function scored(id: string): ScoredItem {
  return {
    platform: "bilibili", id, title: "t", author: "a", authorId: "1", category: "游戏",
    tags: [], url: "u", thumbnail: "p", publishedAt: "2026-06-16T00:00:00Z", durationSec: 60,
    metrics: { views: 1000, likes: 100, coins: 50, favorites: 30, shares: 20, comments: 10, danmaku: 200 },
    signals: { engagementRate: 0.2, velocity: 80, danmakuDensity: 0.2, commentRate: 0.01 },
    potentialScore: 88, confidence: 90,
  };
}

describe("parseAnalysis", () => {
  it("解析纯 JSON", () => {
    const a = parseAnalysis(goodJson);
    expect(a.items[0].viralLogic).toContain("节奏");
    expect(a.patterns).toHaveLength(1);
    expect(a.topicCards[0].angle).toBe("新手向");
  });
  it("解析被 ```json 包裹的内容", () => {
    const a = parseAnalysis("```json\n" + goodJson + "\n```");
    expect(a.items).toHaveLength(1);
  });
  it("无法解析时抛错", () => {
    expect(() => parseAnalysis("不是JSON")).toThrow();
  });
});

describe("analyzeTrends", () => {
  it("调 client.complete 并解析", async () => {
    const client: LLMClient = { complete: async () => goodJson };
    const a = await analyzeTrends([scored("BV1")], client);
    expect(a.items[0].id).toBe("BV1");
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npm test -- analyst`
Expected: FAIL,模块未实现

- [ ] **Step 3: 实现 analyst.ts**

```ts
import type { ScoredItem, TopicCard } from "./types";
import type { LLMClient } from "@/lib/llm/client";

export interface Analysis {
  items: { id: string; viralLogic: string }[];
  patterns: string[];
  topicCards: TopicCard[];
}

const SYSTEM = [
  "你是短视频爆款分析师。基于给定视频的真实数据(播放/互动/涨速)解释其走红逻辑,提炼跨条共性套路,并给出可模仿的选题卡。",
  "严格只输出 JSON,不要任何额外文字。不要编造数据,只基于提供的指标做解释。",
  '输出格式: {"items":[{"id":"<视频id>","viralLogic":"<为什么火,1-2句>"}],"patterns":["<共性套路>"],"topicCards":[{"angle":"<选题角度>","hook":"<开场钩子>","structure":"<结构建议>","refItemIds":["<参考视频id>"]}]}',
].join("\n");

function buildPrompt(items: ScoredItem[]): string {
  const lines = items.map((it) =>
    `- id=${it.id} 标题《${it.title}》 作者:${it.author} 分区:${it.category} ` +
    `播放:${it.metrics.views} 点赞:${it.metrics.likes} 投币:${it.metrics.coins ?? 0} ` +
    `收藏:${it.metrics.favorites} 互动率:${it.signals.engagementRate.toFixed(3)} ` +
    `涨速:${Math.round(it.signals.velocity)}/h 潜力分:${it.potentialScore}`
  );
  return `以下是某分区排行榜的真实数据,请分析:\n${lines.join("\n")}`;
}

export function parseAnalysis(raw: string): Analysis {
  let text = raw.trim();
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) text = fence[1].trim();
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("LLM 响应中找不到 JSON");
  const parsed = JSON.parse(text.slice(start, end + 1)) as Partial<Analysis>;
  return {
    items: Array.isArray(parsed.items) ? parsed.items : [],
    patterns: Array.isArray(parsed.patterns) ? parsed.patterns : [],
    topicCards: Array.isArray(parsed.topicCards) ? parsed.topicCards : [],
  };
}

export async function analyzeTrends(items: ScoredItem[], client: LLMClient): Promise<Analysis> {
  const raw = await client.complete({ system: SYSTEM, prompt: buildPrompt(items) });
  return parseAnalysis(raw);
}
```

- [ ] **Step 4: 运行确认通过**

Run: `npm test -- analyst`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add src/lib/trend/analyst.ts src/lib/trend/analyst.test.ts
git commit -m "feat(trend): LLM 分析器(prompt 构造 + 容错解析)"
```

---

## Task 7: 报告编排与组装(含降级)

**Files:**
- Create: `src/lib/trend/report.ts`
- Test: `src/lib/trend/report.test.ts`

- [ ] **Step 1: 写失败测试**

Create `src/lib/trend/report.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { assembleReport, buildReport } from "./report";
import type { ScoredItem, TrendItem, TrendSource } from "./types";
import type { LLMClient } from "@/lib/llm/client";

const NOW = Date.parse("2026-06-16T12:00:00Z");

function rawItem(id: string): TrendItem {
  return {
    platform: "bilibili", id, title: "t" + id, author: "a", authorId: "1", category: "游戏",
    tags: [], url: "u", thumbnail: "p", publishedAt: "2026-06-16T00:00:00Z", durationSec: 60,
    metrics: { views: 1000, likes: 100, coins: 50, favorites: 30, shares: 20, comments: 10, danmaku: 200 },
  };
}

const source: TrendSource = { platform: "bilibili", fetchTrends: async () => [rawItem("BV1"), rawItem("BV2")] };

describe("assembleReport", () => {
  it("无分析(降级)时 aiStatus=failed, viralLogic 为空", () => {
    const scored = [{ ...rawItem("BV1"), signals: { engagementRate: 0.1, velocity: 50, commentRate: 0.01 }, potentialScore: 80, confidence: 90 } as ScoredItem];
    const r = assembleReport("bilibili", "all", scored, null, NOW);
    expect(r.aiStatus).toBe("failed");
    expect(r.items[0].viralLogic).toBe("");
    expect(r.itemCount).toBe(1);
  });
});

describe("buildReport", () => {
  it("LLM 成功 → aiStatus=ok, 注入 viralLogic", async () => {
    const client: LLMClient = { complete: async () => JSON.stringify({ items: [{ id: "BV1", viralLogic: "快节奏" }], patterns: ["p"], topicCards: [] }) };
    const r = await buildReport({ platform: "bilibili", category: "all", source, client, topN: 10, nowMs: NOW });
    expect(r.aiStatus).toBe("ok");
    expect(r.items.find((i) => i.id === "BV1")?.viralLogic).toBe("快节奏");
  });
  it("LLM 抛错 → 诚实降级 aiStatus=failed, 保留真实榜单", async () => {
    const client: LLMClient = { complete: async () => { throw new Error("boom"); } };
    const r = await buildReport({ platform: "bilibili", category: "all", source, client, topN: 10, nowMs: NOW });
    expect(r.aiStatus).toBe("failed");
    expect(r.items).toHaveLength(2);
  });
  it("无 client → 降级仅榜单", async () => {
    const r = await buildReport({ platform: "bilibili", category: "all", source, client: null, topN: 10, nowMs: NOW });
    expect(r.aiStatus).toBe("failed");
    expect(r.items).toHaveLength(2);
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npm test -- report`
Expected: FAIL,模块未实现

- [ ] **Step 3: 实现 report.ts**

```ts
import type { IntelligenceReport, Platform, ScoredItem, TrendSource } from "./types";
import { scoreItems } from "./scorer";
import { analyzeTrends, type Analysis } from "./analyst";
import type { LLMClient } from "@/lib/llm/client";

const ANALYZE_TOP_K = 15;

export function assembleReport(
  platform: Platform,
  category: string,
  scored: ScoredItem[],
  analysis: Analysis | null,
  nowMs: number
): IntelligenceReport {
  const logicById = new Map((analysis?.items ?? []).map((i) => [i.id, i.viralLogic]));
  return {
    platform,
    category,
    generatedAt: new Date(nowMs).toISOString(),
    itemCount: scored.length,
    items: scored.map((s) => ({ ...s, viralLogic: logicById.get(s.id) ?? "" })),
    patterns: analysis?.patterns ?? [],
    topicCards: analysis?.topicCards ?? [],
    aiStatus: analysis ? "ok" : "failed",
  };
}

export async function buildReport(opts: {
  platform: Platform;
  category: string;
  source: TrendSource;
  client: LLMClient | null;
  topN: number;
  nowMs: number;
  onLog?: (msg: string) => void;
}): Promise<IntelligenceReport> {
  const { platform, category, source, client, topN, nowMs, onLog } = opts;
  onLog?.(`抓取 ${platform} ${category} 排行榜 top${topN}`);
  const items = await source.fetchTrends({ category, topN });
  onLog?.(`抓到 ${items.length} 条,开始打分`);
  const scored = scoreItems(items, nowMs);

  if (!client) {
    onLog?.("未配置 LLM,降级为仅榜单");
    return assembleReport(platform, category, scored, null, nowMs);
  }
  try {
    onLog?.("调用 LLM 分析爆火逻辑");
    const analysis = await analyzeTrends(scored.slice(0, ANALYZE_TOP_K), client);
    return assembleReport(platform, category, scored, analysis, nowMs);
  } catch (error) {
    onLog?.(`AI 分析失败,降级为仅榜单: ${error instanceof Error ? error.message : String(error)}`);
    return assembleReport(platform, category, scored, null, nowMs);
  }
}
```

- [ ] **Step 4: 运行确认通过**

Run: `npm test -- report`
Expected: PASS

- [ ] **Step 5: 全量测试 + 提交**

Run: `npm test`
Expected: 所有测试 PASS

```bash
git add src/lib/trend/report.ts src/lib/trend/report.test.ts
git commit -m "feat(trend): 报告编排与组装(含诚实降级)"
```

---

## Task 8: schema + 任务类型

**Files:**
- Modify: `src/lib/schemas.ts`
- Modify: `src/lib/tasks.ts:5`

- [ ] **Step 1: 加 trendReportSchema**

在 `src/lib/schemas.ts` 末尾追加:

```ts
export const trendReportSchema = z.object({
  platform: z.enum(["bilibili"]).default("bilibili"),
  category: z.string().min(1).default("all"),
  topN: z.coerce.number().int().min(1).max(50).default(20)
});
```

- [ ] **Step 2: TaskType 加 trend-report**

修改 `src/lib/tasks.ts:5`,在联合类型末尾加 `| "trend-report"`:

```ts
export type TaskType = "info" | "clip" | "merge" | "split" | "jianying-plan" | "jianying-draft" | "auto-plan" | "auto-render" | "auto-simulate" | "creator-suite" | "trend-report";
```

- [ ] **Step 3: 编译校验 + 提交**

Run: `npm run typecheck`
Expected: 无新增错误

```bash
git add src/lib/schemas.ts src/lib/tasks.ts
git commit -m "feat(trend): 新增 trendReportSchema 与 trend-report 任务类型"
```

---

## Task 9: API 路由

**Files:**
- Create: `src/app/api/trend/report/route.ts`

- [ ] **Step 1: 实现路由(沿用现有异步任务模式)**

```ts
import { NextResponse } from "next/server";
import { validationErrorResponse } from "@/lib/api";
import { trendReportSchema } from "@/lib/schemas";
import { appendTaskLog, completeTask, createTask, failTask, updateTask } from "@/lib/tasks";
import { bilibiliSource } from "@/lib/trend/sources/bilibili";
import { buildReport } from "@/lib/trend/report";
import { tryCreateLLMClient } from "@/lib/llm/client";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const parsed = trendReportSchema.safeParse(await request.json());
  if (!parsed.success) {
    return validationErrorResponse(parsed.error);
  }

  const { platform, category, topN } = parsed.data;
  const task = createTask("trend-report", `热点情报 ${platform}/${category} top${topN}`);

  void runReport(task.id, category, topN);

  return NextResponse.json({ task });
}

async function runReport(taskId: string, category: string, topN: number) {
  try {
    updateTask(taskId, { status: "processing", progress: 10 });
    const client = tryCreateLLMClient();
    const report = await buildReport({
      platform: "bilibili",
      category,
      source: bilibiliSource,
      client,
      topN,
      nowMs: Date.now(),
      onLog: (msg) => appendTaskLog(taskId, msg),
    });
    completeTask(taskId, report);
  } catch (error) {
    failTask(taskId, error);
  }
}
```

- [ ] **Step 2: 手动联网验证(真跑一次)**

启动 dev server(参考现有惯例,端口如 5181):`PORT=5181 npm run dev`
另开终端:

```bash
curl -s -X POST http://127.0.0.1:5181/api/trend/report \
  -H "Content-Type: application/json" \
  --data-binary '{"platform":"bilibili","category":"all","topN":10}'
```

记下返回 task.id,轮询 `GET /api/tasks?id=<id>`,确认:
- status 最终 completed
- result.items 是 B站真实排行榜(标题/播放数真实)
- result.aiStatus:配了 LLM key 则 ok 且有 viralLogic;没配则 failed 但榜单在

- [ ] **Step 3: 提交**

```bash
git add src/app/api/trend/report/route.ts
git commit -m "feat(trend): /api/trend/report 路由"
```

---

## Task 10: readiness 体检 + .env.example

**Files:**
- Modify: `src/app/api/creator/readiness/route.ts`
- Modify: `.env.example`

- [ ] **Step 1: .env.example 加 LLM 配置**

在 `.env.example` 的 "ASR / OCR / vision providers" 段附近加:

```
# LLM (trend analysis) — GPT 优先, provider 可插拔
LLM_PROVIDER=openai
OPENAI_BASE_URL=https://bmapi.020212.xyz/v1
OPENAI_MODEL=gpt-5.5
# OPENAI_API_KEY 见上(填你的网关 key)
# 备选 provider=anthropic 时:
# ANTHROPIC_BASE_URL=
# ANTHROPIC_API_KEY=
# ANTHROPIC_MODEL=claude-sonnet-4-6
```

- [ ] **Step 2: readiness 加 LLM 配置检测**

阅读 `src/app/api/creator/readiness/route.ts` 现有的 env-key 检测写法(它已检测多个 `process.env.*` key 是否存在)。按相同结构新增一项 LLM 配置就绪检测:当 `LLM_PROVIDER=anthropic` 时检查 `ANTHROPIC_API_KEY`,否则检查 `OPENAI_API_KEY`;存在则标记 "热点情报 LLM 就绪",缺失则标红提示去 `.env` 配置。沿用该文件已有的返回结构与字段命名,不要新造格式。

- [ ] **Step 3: 编译校验 + 提交**

Run: `npm run typecheck`
Expected: 无新增错误

```bash
git add src/app/api/creator/readiness/route.ts .env.example
git commit -m "feat(trend): readiness 体检纳入 LLM 配置 + .env.example"
```

---

## Task 11: 前端接真报告(替换 trend/predict 假标签)

**Files:**
- Modify: `src/app/page.tsx`

> 前端涉及现有大文件,先通读 `src/app/page.tsx` 摸清:① `capabilities` 数组里 `trend`/`predict` 两个标签的定义;② 现有按钮如何发请求+轮询任务(参考 `generateDraft`/`runStageAction` 的 fetch→poll `/api/tasks?id=` 模式);③ 任务结果如何渲染。**严格沿用现有状态管理、fetch、轮询、样式模式**,不要引入新风格。

- [ ] **Step 1: 加触发函数(沿用现有 fetch+poll 模式)**

在 page 组件内新增(对齐现有 `generateDraft` 写法):

```ts
const [trendReport, setTrendReport] = useState<IntelligenceReport | null>(null);
const [trendCategory, setTrendCategory] = useState("all");
const [loadingTrend, setLoadingTrend] = useState(false);

async function generateTrendReport() {
  setLoadingTrend(true);
  try {
    const res = await fetch("/api/trend/report", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ platform: "bilibili", category: trendCategory, topN: 20 }),
    });
    const { task } = await res.json();
    // 轮询直到完成(复用页面已有的轮询工具/或仿照现有实现)
    const final = await pollTask(task.id);
    if (final.status === "completed") setTrendReport(final.result as IntelligenceReport);
  } finally {
    setLoadingTrend(false);
  }
}
```

> `IntelligenceReport` 从 `@/lib/trend/types` 导入。`pollTask` 若页面已有同等逻辑则复用;若没有,仿照现有任务轮询(GET `/api/tasks?id=`,间隔轮询至 `completed`/`failed`)抽一个本地函数。

- [ ] **Step 2: trend/predict 标签渲染真报告**

在 `trend`(热点趋势)与 `predict`(爆火预测)激活时,渲染:
- 分区选择(下拉:综合 all / 游戏 game / 知识 knowledge / 动画 animation / 音乐 music / 生活 life / 科技 tech …,值对应 `ridForCategory` 支持的 key)
- "生成热点情报"按钮 → `generateTrendReport()`
- 报告区:遍历 `trendReport.items` 渲染卡片(标题/作者/真实播放·点赞·互动率/潜力分/置信度/`viralLogic`);下方渲染 `patterns` 列表与 `topicCards`
- 当 `trendReport.aiStatus === "failed"`:在 AI 部分明确显示"AI 分析失败,仅展示真实榜单数据"

移除/替换这两个标签原先调用 `creator-suite` 假模板的逻辑。

- [ ] **Step 3: 自测(必须起 dev server 浏览器走查)**

1. `PORT=5181 npm run dev`,浏览器开 http://127.0.0.1:5181
2. 切到"热点趋势"标签,选分区,点"生成热点情报"
3. 确认:榜单是 B站真实数据;配了 key 则有 AI 爆火逻辑/选题卡;走查无 console error
4. 故意清空 `.env` 的 LLM key 重试一次,确认降级提示正确显示("AI 分析失败,仅展示真实榜单数据"),不假装成功

- [ ] **Step 4: typecheck + 提交**

Run: `npm run typecheck`
Expected: 无新增错误

```bash
git add src/app/page.tsx
git commit -m "feat(trend): 前端 trend/predict 标签接入真实热点情报报告"
```

---

## Task 12: 端到端验收 + 推送

- [ ] **Step 1: 全量测试**

Run: `npm test`
Expected: 全部 PASS

- [ ] **Step 2: 构建校验**

Run: `npm run build`
Expected: 构建成功

- [ ] **Step 3: 真实端到端走查**

起 dev server,从前端走一遍真实流程(选分区→出报告→数据真实→AI 分析合理或降级诚实),对照 spec 验收红线:
- 排序由真实数据驱动 ✓
- LLM 只解释不编数 ✓
- 置信度=数据支撑度,UI 不暗示"会火概率" ✓
- 失败诚实降级,不造假 ✓

- [ ] **Step 4: 推送 GitHub**

```bash
git push
```

Expected: 推送到 https://github.com/LinXingjian365/ai-video-creator

---

## Self-Review(计划完成后已核对)

- **Spec 覆盖**:数据源(Task4)、打分(Task3)、LLM分析(Task5/6)、报告组装+降级(Task7)、API(Task9)、前端替换假标签(Task11)、env+readiness(Task10)、测试(各 Task)、端到端(Task12)——spec 各节均有对应任务。
- **占位符**:无 TBD/TODO;每个代码步骤含完整代码。前端 Task11 因依赖现存大文件,明确要求先通读再按既有模式实现,并给出了具体触发/渲染逻辑与降级文案。
- **类型一致**:`TrendItem/ScoredItem/IntelligenceReport/TopicCard/Analysis/LLMClient/TrendSource` 命名贯穿各 Task;`createLLMClient`/`tryCreateLLMClient`、`mapRankingResponse`/`ridForCategory`、`scoreItems`/`computeSignals`/`computeConfidence`、`assembleReport`/`buildReport`、`analyzeTrends`/`parseAnalysis` 跨任务签名一致。
