# 热点情报大脑 (S1 Trend Intelligence) — 设计文档

- 日期：2026-06-16
- 状态：已与用户对齐,待实现
- 所属愿景：AI 内容创作自动化工厂的第 1 个子系统(地基)

---

## 1. 背景与目标

当前项目的"AI 大脑"全是写死模板——`creator-suite.ts` 的热点雷达/爆火预测/文案生成都是字符串拼接,预测分是个"关键词条数×4"的算术公式,全仓**没有一次真实的 AI 模型调用、没有一次联网请求**。真实落地的只有执行层(FFmpeg 引擎、剪映草稿、任务系统)。

S1 的目标:**把"假模板"换成真东西**——联网抓真实热点数据 → 确定性打分排序 → LLM 解释爆火逻辑并生成可模仿选题卡 → 产出一份按需的"热点情报报告"。

### 已确认的范围决策

| 维度 | 决策 |
|---|---|
| 赛道 | 跨分区通用(分区作为参数,不写死) |
| 预算 | 免费优先:B站公开 API + LLM 用标准 API key(GPT 优先,provider 可插拔) |
| 平台 | 第一版只做 B站;架构必须可扩展到抖音/YouTube |
| 输出 | 按需触发,出排序情报报告(真实数据 + AI 爆火逻辑 + 选题卡 + 置信度) |
| 技术路线 | A:数据先行,LLM 只解释(不让 LLM 编数据) |

### 三条诚实红线

1. **置信度 ≠ "会火的概率"**,而是"这条判断的数据支撑强度"(样本量 / 信号一致性 / 数据新鲜度)。系统不假装能预言未来。
2. **绝不静默造假**:抓取或 LLM 失败时明确报错或诚实降级,绝不退回假数据冒充成功。
3. **数据真、AI 只解释**:排序由真实互动数据驱动(杜绝幻觉),LLM 只负责它擅长的解释与创意。

---

## 2. 架构

```
┌─ 数据源层 (可插拔适配器, 平台无关接口) ─┐
│   BilibiliSource   ← v1 先做                │
│   DouyinSource     ← 以后加 (TikHub/付费)   │
│   YoutubeSource    ← 以后加 (YT Data API)   │
└──────────────┬──────────────────────────────┘
               ↓  统一吐出 TrendItem[] (归一化)
        ┌──────────────┐
        │ Scorer 打分器 │  确定性公式算"潜力分"(纯函数,可测)
        └──────┬───────┘
               ↓  ScoredItem[] (已排序 + 真实指标)
        ┌──────────────┐
        │ LLM Analyst   │  复用 Claude 网关:解释为什么火 + 提炼套路 + 生成选题卡
        └──────┬───────┘
               ↓
        ┌──────────────┐
        │ Report 组装   │ → IntelligenceReport
        └──────────────┘
```

**可扩展性的核心约定**:所有平台数据先归一化成统一的 `TrendItem`。打分器和 LLM 分析器**只认 `TrendItem`,不认平台**。以后加抖音/YouTube 只需写一个新的 `TrendSource` 适配器,下游链路零改动。

---

## 3. 模块与接口

### 3.1 平台无关类型(`src/lib/trend/types.ts`)

```ts
type Platform = "bilibili" | "douyin" | "youtube";

interface TrendItem {
  platform: Platform;
  id: string;            // bvid / aweme_id / video_id
  title: string;
  author: string;
  authorId: string;
  category: string;      // 分区名
  tags: string[];
  url: string;
  thumbnail: string;
  publishedAt: string;   // ISO 8601
  durationSec: number;
  metrics: {
    views: number;
    likes: number;
    coins?: number;      // B站特有
    favorites: number;
    shares: number;
    comments: number;
    danmaku?: number;    // B站特有
  };
}

interface TrendSource {
  readonly platform: Platform;
  fetchTrends(opts: { category: string; topN: number }): Promise<TrendItem[]>;
}

interface SignalSet {
  engagementRate: number;   // (likes+coins+favorites+shares)/views
  velocity: number;          // views / hoursSincePublish
  danmakuDensity?: number;   // danmaku / views
  commentRate: number;       // comments / views
}

interface ScoredItem extends TrendItem {
  signals: SignalSet;
  potentialScore: number;    // 0-100
  confidence: number;        // 0-100, 数据支撑强度, 后端算
}

interface TopicCard {
  angle: string;       // 选题角度
  hook: string;        // 开场钩子建议
  structure: string;   // 结构建议
  refItemIds: string[];
}

interface IntelligenceReport {
  platform: Platform;
  category: string;
  generatedAt: string;
  itemCount: number;
  items: Array<ScoredItem & { viralLogic: string }>;  // viralLogic 来自 LLM
  patterns: string[];        // 跨条共性套路 (LLM)
  topicCards: TopicCard[];   // 可模仿选题卡 (LLM)
  aiStatus: "ok" | "failed"; // LLM 是否成功,失败时诚实标注
}
```

### 3.2 BilibiliSource(`src/lib/trend/sources/bilibili.ts`)

- 主力端点:`GET https://api.bilibili.com/x/web-interface/ranking/v2?rid={分区rid}&type=all`
  - 开放、免登录、免签名
  - 返回的 `list[].stat` 直接含 view/danmaku/reply/favorite/coin/share/like —— **一次请求拿全真实互动数,无需逐条再抓**
- 必须带请求头:`User-Agent`(常见浏览器 UA)+ `Referer: https://www.bilibili.com`,否则 -412 风控
- 分区映射:维护一张 `rid → 分区名` 表(全站/动画/游戏/知识/生活/音乐/影视…),`category="all"` → rid=0 综合榜
- 限流:失败指数退避重试(最多 3 次);请求间适度间隔
- 映射:B站字段 → `TrendItem`(bvid→id、owner.name→author、stat→metrics、duration→durationSec、pubdate→publishedAt ISO)

### 3.3 Scorer(`src/lib/trend/scorer.ts`,纯函数)

- 输入 `TrendItem[]`,逐条算 `SignalSet`:
  - `engagementRate = (likes + coins + favorites + shares) / max(views,1)`
  - `velocity = views / max(hoursSincePublish, 1)`
  - `danmakuDensity = danmaku / max(views,1)`(有则算)
  - `commentRate = comments / max(views,1)`
- 各信号在本批内归一化(min-max),加权求和 → `potentialScore` 0-100
- `confidence`(数据支撑强度):基于该条数据完整度 + 样本新鲜度(发布时间越近、数据越全 → 越高);**与"会不会火"无关,仅表达数据可信度**
- 纯函数,无 IO,可单测

### 3.4 LLM Analyst(`src/lib/trend/analyst.ts` + `src/lib/llm/client.ts`)

- **Provider 可插拔,GPT 优先**:抽一个 `LLMClient`(`src/lib/llm/client.ts`),业务代码只调 `client.complete(prompt, schema)`,不关心背后是哪家。
  - 默认 provider = `openai`(GPT),走 **OpenAI 兼容 Chat Completions**(`{base_url}/chat/completions`)——这同时覆盖 OpenAI 官方、第三方网关(如用户的 `bmapi.020212.xyz`)、各类代理
  - 备选 provider = `anthropic`(Claude 网关),走 `/v1/messages`
  - 由 `LLM_PROVIDER` 环境变量切换,默认 `openai`
- **凭证**:用标准 **API key**(`OPENAI_API_KEY` + `OPENAI_BASE_URL` + `OPENAI_MODEL`)。**不使用 ChatGPT OAuth 账号令牌**(违反 ToS、会过期、需 refresh,不适合服务端常驻)
- 输入:打分后的 top K 条(标题/作者/标签/真实指标/potentialScore)
- 输出(强制结构化 JSON):每条 `viralLogic` + `patterns` + `topicCards`
- **不让 LLM 改 confidence/potentialScore/任何数字**——它只产出文字解释与创意
- 解析失败/网络失败 → 抛错,由 route 降级处理

### 3.5 API 路由(`src/app/api/trend/report/route.ts`)

- `POST { platform: "bilibili", category: "all"|分区rid, topN?: 20 }`
- zod 校验 → 创建 `trend-report` 类型任务(复用现有 task 系统)→ 异步执行 → 完成写 `IntelligenceReport` 到 task.result
- 流程:`source.fetchTrends` → `scorer.score` → `analyst.analyze(topK)` → 组装 → `completeTask`

### 3.6 前端

- 替换现有假的 `trend`(热点趋势)和 `predict`(爆火预测)标签:接 `/api/trend/report`,轮询任务,渲染真实报告
- 展示:排序榜单(标题/作者/真实指标/潜力分/置信度)+ AI 爆火逻辑 + 共性套路 + 可模仿选题卡
- AI 降级时,明确显示"AI 分析失败,仅展示真实榜单数据"

---

## 4. 数据流

```
选分区 + 点触发
  → POST /api/trend/report {platform, category, topN}
  → createTask("trend-report")
  → BilibiliSource.fetchTrends   → TrendItem[]   (真实抓取)
  → Scorer.score                 → ScoredItem[]  (确定性打分排序)
  → LLM Analyst.analyze(topK)     → {viralLogic, patterns, topicCards}
  → 组装 IntelligenceReport       → completeTask(result)
  → 前端轮询 → 渲染报告
```

---

## 5. 错误处理与降级(绝不静默造假)

| 失败点 | 处理 |
|---|---|
| B站抓取失败 / -412 风控 | 指数退避重试(≤3 次);仍失败 → 任务 `failed`,明确报"B站接口风控/失败",**不退回假数据** |
| B站返回结构异常 | 跳过坏条目并记日志;全坏 → 任务失败报错 |
| LLM 网络/解析失败 | **诚实降级**:保留真实榜单+打分,`aiStatus="failed"`,viralLogic/patterns/topicCards 留空并前端标注;不假装成功 |
| 缺少 LLM 配置 | 任务直接降级为"仅榜单"模式 + 明确提示去配置;readiness 体检也会提前标红 |

---

## 6. 测试策略

- **Scorer**:纯函数单测(给定指标 → 期望分数/排序)
- **BilibiliSource**:用一份录制的真实 ranking 响应做映射单测(字段 → TrendItem);一次真实联网 smoke test
- **Analyst**:mock LLM 响应测 JSON 解析 + 降级路径;真跑一次确认网关连通
- **端到端**:真跑 B站综合排行榜出一份报告,人工核对数据真实性与报告质量

---

## 7. 第一版范围(YAGNI)

**做**:
- B站 + 分区排行榜(`ranking/v2`)
- 按需触发
- 确定性打分 + LLM 分析 + 情报报告
- 前端替换 trend/predict 两个假标签
- 新增 env:`LLM_PROVIDER`(默认 openai)、`OPENAI_API_KEY` / `OPENAI_BASE_URL` / `OPENAI_MODEL`(GPT 优先);备选 `ANTHROPIC_*`。readiness 体检加 LLM 配置检测

**不做(留后续)**:
- 热搜(需 wbi 签名)、抖音/YouTube 适配器、定时自动看板、结果缓存、历史趋势对比、多分区批量扫描

---

## 8. 涉及文件

新增:
- `src/lib/trend/types.ts`
- `src/lib/trend/sources/bilibili.ts`
- `src/lib/trend/scorer.ts`
- `src/lib/trend/analyst.ts`
- `src/lib/trend/report.ts`(组装)
- `src/lib/llm/client.ts`(provider 可插拔的 LLM 客户端,GPT 优先)
- `src/app/api/trend/report/route.ts`
- 测试文件若干

修改:
- `src/lib/schemas.ts`(新增 trendReportSchema)
- `src/lib/tasks.ts`(TaskType 加 "trend-report")
- `src/app/page.tsx`(trend/predict 标签接真报告)
- `src/app/api/creator/readiness/route.ts`(体检加 LLM 配置)
- `.env.example`(新增 LLM_PROVIDER / OPENAI_* / 备选 ANTHROPIC_*)
