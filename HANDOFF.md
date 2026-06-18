# Codex 接手指南 — AI 视频生成剪辑助手

**接手时间**:2026-06-18  
**上一会话**:Claude Code (Opus 4.8)  
**分支**:`feat/s1-trend-intelligence` (29 commits, 领先 origin 5 commits, **未 push**)

---

## 项目一句话

本地 AI 视频创作控制台：B站热点抓取 → LLM 脚本生成 → TTS 配音 → Remotion 成片渲染 → 多平台变体 → 剪映草稿。Next.js 15 App Router, 全 TypeScript。

## 快速启动

```bash
cd "A:/AI视频生成剪辑助手"
# 确保 .env.local 存在且含 DEEPSEEK_API_KEY
npm run dev    # 默认 high port, 浏览器打开 http://127.0.0.1:<port>
npm run build  # 构建前必须先停 dev, 否则 .next 冲突报 PageNotFoundError 假失败
npx vitest run # 123 tests, 21 files
```

## 当前状态

| 项 | 状态 |
|---|---|
| production build | ✅ 绿 |
| 测试 (123) | ✅ 全绿 |
| typecheck | ✅ 绿 |
| B-roll 素材合成 | ✅ 已实现+实测 |
| AI 配音 (TTS) | ✅ edge-tts / SAPI 双引擎 |
| 字幕烧录 (配音时间轴) | ✅ 长句分段轮播 |
| 一键全链路 | ✅ |
| 发布 dry-run | ✅ |
| 多平台热点源 | ✅ B站真实 + YouTube/抖音/快手(TikHub) + Exa/Firecrawl 网页证据 |
| UI 重设计 | ✅ Midnight Neon 暗夜霓虹 |
| BGM 混音 | ✅ FFmpeg 渲染后混音(无配音/配音双路径) |
| 平台发布脚手架 | ✅ 本地队列 + adapter 状态 + 人工确认闸门 |
| 真实发布 adapter 草案 | ✅ Postiz draft / social-auto-upload command preview / live 开关 |
| 数据回流 | ✅ 本地 analytics ledger + 30m/24h/7d 快照建议 |
| **真实账号联调 / n8n 自动编排** | **← 下一项** |

## 关键技术细节

### Remotion
- **OffthreadVideo 不接受 `file://` URL**。本地素材必须走 `staticFile()` + `publicDir`。
- `src/lib/broll.ts` 的 `stageBrollAssets(clips, publicDir)` 在渲染前把本地源拷进 publicDir、回写相对 key。
- `src/lib/remotion-render.ts` 的 `renderScriptPackage()` 在 bundle 前 stage、bundle 后清理暂存目录。
- `src/remotion/ScriptPackage.tsx` 组件用 `staticFile()` 解析相对 key、http(s) 直传。

### 字体 (国内坑)
- **不要用 Google Fonts 构建期拉取**, 国内可能卡住。
- 当前方案: `src/app/fonts/*.woff2` (jsdelivr @fontsource 自托管) + `layout.tsx` 的 `next/font/local`。
- 字体: Sora (600/700/800 标题) + IBM Plex Mono (400/500/600 数据/等宽)。

### LLM
- 默认 DeepSeek (`deepseek-v4-flash`), key 在 `.env.local` 的 `DEEPSEEK_API_KEY`。
- 保留接入位: doubao-ark / claude-gateway / gpt-gateway。

### 外部依赖
- **B站 API**: 真实排行榜, 但 `code=-352` 风控间歇触发, 重试/换分区通常恢复。
- **YouTube**: 已下线免登录 Trending 页, 需 `YOUTUBE_API_KEY` (Data API v3)。
- **抖音**: 无官方公开 API, 需 `TIKHUB_API_KEY` (第三方)。
- **TTS**: edge-tts (微软免费 neural, 需联网) / SAPI (本地保底, `py312` 环境)。
- **ASR**: faster-whisper 1.2.1 (py312), CPU int8 + VAD 模式。
- **剪映**: 已加密版, 走 `pyJianYingDraft` 0.2.6 从零生成明文草稿绕过。

### 文件结构关键路径
```
src/
  app/                  # Next.js App Router
    page.tsx            # 单页控制台 (1827行, 包含所有面板组件)
    globals.css         # Midnight Neon 设计系统
    layout.tsx          # 字体挂载 (next/font/local)
    fonts/              # 自托管 woff2 文件
    api/                # 27 个 API 路由
  lib/
    broll.ts            # B-roll planner + stageBrollAssets
    audio-mix.ts        # BGM / narration+BGM FFmpeg mix layer
    remotion-render.ts  # Remotion 渲染入口 + publicDir 暂存逻辑
    narrated-render.ts  # 配音成片 (TTS → Remotion → narration/BGM 混音)
    tts/synthesize.ts   # TTS 合成 (edge-tts/SAPI 可插拔)
    full-chain.ts       # 一键全链路编排
    llm/client.ts       # LLM 客户端 (DeepSeek 默认)
    publish/adapters.ts # social-auto-upload/Postiz/manual adapter 状态
    publish/queue.ts    # 本地待发布队列 + 人工确认闸门
    publish/dispatch.ts # approved 队列项 → Postiz 草稿/命令预览
    analytics/ledger.ts # 平台数据快照、信号计算、下一步动作建议
  remotion/
    ScriptPackage.tsx   # Remotion 组件 (B-roll + 字幕 + 无配音/配音双模式)
    captions.ts         # 字幕引擎 (真实时间轴 + 长句分段)
    Root.tsx            # Remotion Composition 注册
```

## 已完成: BGM 混音 (优先级②)

**目标**: 成片混入背景音乐。

**入口点**:
- `src/lib/audio-mix.ts`: 统一 FFmpeg 混音层，含 `mixBackgroundMusic()` 和 `mixNarrationWithBackgroundMusic()`。
- `src/lib/remotion-render.ts`: 无配音 Remotion 成片可传 `bgmPath/bgmVolume`，先渲染临时 silent MP4，再混入 BGM。
- `src/lib/narrated-render.ts`: 配音版成片可传 `bgmPath/bgmVolume/narrationVolume`，用 `amix=duration=first` 混合口播+BGM。
- `src/lib/full-chain.ts` / `src/app/page.tsx`: 一键全链路 UI 已暴露 BGM 路径、BGM 音量、口播音量。

**实现方式**: 渲染后混音，不把本地音频塞进 Remotion `<Audio>`，避免本地文件 URL / bundle 约束。BGM 输入使用 `-stream_loop -1` 循环，输出 `H.264 video copy + AAC 192k audio`。

**BGM 来源下一步**:
1. 让 LLM 在脚本生成时推荐 BGM 曲风 (当前 `ScriptDraft.bgm` 字段已有)
2. 下载免版权 BGM 或维护本地库存 `workspace/input/audio`
3. 根据脚本 `bgm` 文案自动匹配本地曲库

**验证方式**: 已有 `src/lib/audio-mix.test.ts` / `narrated-render.test.ts` / `full-chain.test.ts` 覆盖参数传递和 FFmpeg filter；还需要在每轮交付前跑一次真实 ffmpeg/ffprobe 烟测。

## 已完成: 平台发布脚手架

目标：把当前 dry-run 推进到可配置发布器接口，先不真发，先建立平台 adapter、账号/登录态检查、待发布队列和人工确认闸门。

**入口点**:
- `src/lib/publish/adapters.ts`: 识别 social-auto-upload、Postiz、manual adapter 状态；当前 `canPublish=false`，全部 dry-run only。
- `src/lib/publish/queue.ts`: `workspace/drafts/publish-queue.json` 本地队列；`ready/blocked/approved` 状态；人工确认口令 `CONFIRM_DRY_RUN_ONLY`。
- `src/app/api/publish/queue/route.ts`: `GET` 队列+adapter 状态，`POST` 先 dry-run 再入队。
- `src/app/api/publish/approve/route.ts`: 人工批准，不真发。
- `src/app/page.tsx`: 发布面板可加入队列、查看 adapter、输入确认口令并批准。

## 已完成: 真实发布 adapter 草案 / 数据回流

目标：在不破坏 dry-run 默认安全闸门的前提下，接入 social-auto-upload/Postiz 的真实 adapter 草案，并开始建立 30分钟/24小时/7天数据回流模型。真实上传必须继续要求 `approved` 队列项和人工确认。

**入口点**:
- `src/lib/publish/dispatch.ts`: 消费 `approved` 队列项；manual/social-auto-upload 默认只预览；Postiz 在 `PUBLISH_LIVE_ENABLED=true` 且配置完整时调用 `POST /public/v1/posts` 创建 `draft`。
- `src/app/api/publish/dispatch/route.ts`: 发布 dispatch API。
- `src/lib/analytics/ledger.ts`: `workspace/drafts/analytics-ledger.json`；计算互动率、分享率、评论率、涨粉转化率，并输出下一步动作。
- `src/app/api/analytics/import/route.ts`: `GET` ledger，`POST` 导入 30m/24h/7d/custom 指标快照。
- `src/app/page.tsx`: 发布面板可 dispatch 草稿；运营复盘面板可导入指标快照并查看建议。

**安全默认**:
- `.env.example` 默认 `PUBLISH_LIVE_ENABLED=false`。
- Postiz live 只创建 `type:"draft"`，不调用 `now` 真发。
- social-auto-upload 只生成命令预览，不执行外部上传命令。

## 下一步: 真实账号联调 / n8n 自动编排

目标：配置真实 Postiz/social-auto-upload 登录态后做一次草稿联调；同时建立 n8n webhook，把“热点 → 脚本 → 成片 → 队列 → 复盘导入”串成定时任务。

## Git 注意事项

- 仓库: `https://github.com/LinXingjian365/ai-video-creator.git` (origin)
- **全局 gitconfig 有坏的 gh 助手** (`A:\GitHub CLI\gh.exe` 已删), 推代码需仓库级覆盖 credential helper:
  ```bash
  git config --local credential.helper ""
  git config --local credential.helper manager
  # 或直接用个人 access token
  ```
- 当前有 5 个未推送 commits, **建议在 BGM 混音完成后一起 push**。

## 记忆文件

项目有持久记忆在 `C:\Users\Administrator\.claude\projects\A--AI--------\memory\`:
- `project-state-2026-06-16.md` — 完整项目状态 (本文内容源自该文件)
- `remotion-broll-file-url-constraint.md` — Remotion file:// 约束及解法
- `ai-video-toolchain-state.md` — 本机工具链 (ffmpeg/python/yt-dlp/whisper/剪映)
- `github-repo-and-credential-gotcha.md` — GitHub 凭证踩坑记录
- `MEMORY.md` — 所有记忆的索引

## Codex 更新: n8n 自动编排已接入

已完成：
- `src/lib/orchestration/n8n.ts`：生成 n8n workflow blueprint 和全链路 payload；默认 dry-run；webhook 模式需要 `CONFIRM_N8N_WEBHOOK`。
- `src/app/api/orchestration/n8n/route.ts`：`GET` 返回配置状态/蓝图，`POST` 创建 `n8n-orchestration` 任务并生成 payload 或触发 webhook。
- `src/app/page.tsx`：运营复盘面板新增 n8n 编排卡片，按钮可点击生成 payload 或触发 webhook。
- `.env.example`：增加 `APP_BASE_URL`、`N8N_WEBHOOK_URL`、`N8N_WEBHOOK_SECRET`。

## Codex 更新: n8n workflow JSON 导出

已完成：
- `src/lib/orchestration/n8n.ts`：新增 `buildN8nImportableWorkflow()` 和 `exportN8nWorkflowFile()`，生成不含 credentials/API key 的 n8n workflow JSON。
- `/api/orchestration/n8n`：请求里传 `exportWorkflow: true` 会写入 `workspace/drafts/n8n-workflow-*.json` 并在任务结果返回路径。
- `src/app/page.tsx`：运营复盘面板新增“导出 workflow JSON”按钮。

下一步：
- 把导出的 JSON 导入真实 n8n 实例，调通定时触发、失败重试、approved 队列 id 映射和 analytics 数据源映射。
- 配置真实 Postiz/social-auto-upload 登录态后，先创建 Postiz draft，不直接真发。

## Codex 更新: 发布账号 preflight 已接入

已完成：
- `src/lib/publish/preflight.ts`：检查 Postiz API key、`POSTIZ_INTEGRATION_ID_*`、可选 `GET /public/v1/integrations` probe、social-auto-upload session/config 文件存在性；不返回 secret。
- `src/app/api/publish/preflight/route.ts`：`GET` 直接返回体检报告，`POST` 创建 `publish-preflight` 任务并返回最终 task。
- `src/app/page.tsx`：发布矩阵面板新增“发布账号联调体检”按钮，可点击跑实际后端检查并展示 blockers/nextActions。
- `.env.example`：补齐 `SOCIAL_AUTO_UPLOAD_CONFIG`。

下一步：
- 在真实 Postiz/social-auto-upload 登录态配置好后，先跑 `/api/publish/preflight?probePostiz=true`，确认无 blocker，再批准一个队列项并用 `mode=draft` 做 Postiz 草稿烟测。
- social-auto-upload 仍只生成命令预览；真正执行上传命令前要继续保留人工确认和 dry-run 默认。

## Codex 更新: TikHub 抖音/快手热榜已接入

已完成：
- `src/lib/trend/sources/tikhub.ts`：新增 TikHub Bearer 请求层，支持 `TIKHUB_BASE_URL`、`TIKHUB_TIMEOUT_MS`、`TIKHUB_ENDPOINT_DOUYIN`、`TIKHUB_ENDPOINT_KUAISHOU`，并把常见 TikHub 响应字段归一化成统一 `TrendItem`。
- `src/lib/trend/sources/douyin.ts`：从“只报错降级”推进到 TikHub 抖音热榜源。
- `src/lib/trend/sources/kuaishou.ts`：新增快手热榜源，支持 `hot/entertainment/society/useful/challenge/search` board type。
- `/api/trend/report`：schema 已支持 `kuaishou`，UI 热点情报下拉已增加快手。

下一步：
- 配置真实 `TIKHUB_API_KEY` 后，分别跑 `platform=douyin` 和 `platform=kuaishou` 的 `/api/trend/report`，确认真实响应字段是否需要补充映射。
- 继续接 TikHub 搜索、评论、单视频详情，把“爆款链接/标题 -> 原视频信号 -> 素材候选”补成上游完整闭环。

## Codex 更新: TikHub 竞品研究已接入

已完成：
- `src/lib/trend/research.ts`：新增 TikHub 研究层，支持抖音/快手关键词搜索、URL/ID 单视频详情、评论样本抓取、endpoint 调用记录、素材候选和下一步动作。
- `src/app/api/trend/research/route.ts`：新增 `trend-research` 任务，失败时会明确返回缺 key 或 HTTP 错误，不伪装成功。
- `src/app/page.tsx`：联网素材模块新增“TikHub 爆款研究”真实按钮，结果会回填素材导入链接和参考标题列表。
- `.env.example`：补齐 TikHub 搜索、详情、评论 endpoint 覆盖项。
- `docs/API.md` / `docs/FULL_CHAIN_TOOLCHAIN.md` / `docs/ROADMAP.md`：同步 API、工具链状态和剩余工作。

下一步：
- 配置真实 `TIKHUB_API_KEY` 后，用抖音/快手关键词和单视频链接各跑一次，按真实响应补充字段映射。
- 继续接 Exa/Firecrawl 搜索 route，把网页事实依据、案例链接和平台热点合并进同一选题证据包。

## Claude 更新: Exa / Firecrawl 网页证据搜索已接入 (commit a51b821)

已完成:
- `src/lib/trend/evidence.ts`: `runEvidenceSearch()` 双源适配; `auto` 模式按 `EXA_API_KEY` / `FIRECRAWL_API_KEY` 可用性自动选; 未配 key 抛明确错; endpoint/base/timeout 经 env 覆盖 (`EXA_BASE_URL`/`EXA_SEARCH_ENDPOINT`/`FIRECRAWL_BASE_URL`/`FIRECRAWL_SEARCH_ENDPOINT`/`EVIDENCE_TIMEOUT_MS`)。
- `src/lib/trend/evidence.test.ts`: 7 单测覆盖 Exa happy / Firecrawl happy / 双 key 缺失 / explicit provider mismatch / 空 query / 空结果 nextAction / 上游 HTTP 错误透传。
- `/api/trend/evidence`: POST 经 Zod 校验, 产 `trend-evidence` 任务, 失败 500、成功 200。
- `evidenceSearchSchema` 加入 `src/lib/schemas.ts`; `trend-evidence` 加入 `TaskType`。
- `src/app/page.tsx`: "联网素材"面板新增"网页事实证据搜索"卡, 复用 `researchQuery`, provider 选 `auto/exa/firecrawl`; 结果展示来源、链接、发布日期、摘要、`nextActions`。
- `src/app/globals.css`: `.evidence-snippet` 样式。
- 验收: typecheck / 全量 166 测试 / production build 全绿; dev `:5215` 烟测验证按钮 → API → 任务流水显示一致, 0 console 报错。

下一步:
- 把证据条目自动并入 `script/generate.ts` 生成的草稿引用 (新增可选 `evidence: EvidenceResult[]` 字段, 在 LLM prompt 里以 "fact sources" 形式喂入)。
- 真实联调 Postiz / social-auto-upload 草稿(P5 验收剩余项)。
- 真实 n8n 实例导入 `workspace/drafts/n8n-workflow-*.json` 跑定时任务。
