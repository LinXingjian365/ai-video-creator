# Codex 接手指南 — AI 视频生成剪辑助手

**最后更新**:2026-06-19(Codex — A 方案任务指挥舱、剪辑执行轨、n8n 重试与审批映射)
**分支**:`feat/s1-trend-intelligence` — **61 commits,本轮待 push 到 origin**
**状态**:✅ **225 tests 绿(36 files)** / typecheck 绿 / build 绿 / **前端已切换 A 方案“AI 视频任务指挥舱”并完成桌面/移动截图验证** / 全链路自检面板 + 抖音搜索/评论免费路径(TTD)/ Docker 全栈(AutoStart 需 DD GUI 开)

## 前端 A 方案：AI 视频任务指挥舱(2026-06-19)
- **方案文档**:`docs/FRONTEND_REDESIGN.md`；项目级设计系统:`.interface-design/system.md`。
- **已落地第一轮**:`page.tsx` 七阶段生产轨道 + 顶部横向阶段地图 + 执行/素材/发布/系统四类指标 + 右侧 AI 执行塔；自动剪辑页增加由工作区资产和 FFmpeg 任务驱动的真实执行轨；`globals.css` 切换黑曜石/钢灰/琥珀/青蓝 Operations Bay 视觉。
- **真实能力保留**:热点、素材、脚本、剪辑、发布、复盘、自检面板继续调用既有 API 和任务队列，不是静态换皮。
- **验证**:桌面 1440×1000、移动 390×900 headless Chrome 截图已检查；移动端生产轨道压为两列，主工作区可在首屏下方进入。
- **Stitch 设计稿**(已生成主屏):https://stitch.withgoogle.com → 项目「AI 视频增长控制台 — 大厂级重设计」(`projects/15497212605110749047`,设计系统 `assets/248578457415922417`)。可用 `edit_screens`/`generate_screen_from_text` 续生成子页。
- **Figma 文件**(空,待画):https://www.figma.com/design/MrGOowBiC9lCzepy5GZoCG(用户 View 席位但能建文件;use_figma 写入需 figma-use 技能)
- **剩余设计项**:继续逐个优化七阶段内部工作台，重点补素材预览和真实链路配置向导；Stitch/Figma 只做参考，不再凌驾于代码中的真实功能。

> **如果上一轮 session 跑过 push**,先 `git log --oneline origin/feat/s1-trend-intelligence..HEAD` 确认 delta。

---

## 项目一句话

本地 AI 视频创作控制台:B站/抖音/快手/YouTube 热点抓取 → Exa/Firecrawl 网页事实 → LLM 脚本生成(带引用) → TTS 配音 → Remotion 成片(B-roll + 烧录字幕 + BGM 自动选曲) → 多平台变体 → 发布队列(人工确认) → 数据回流。Next.js 15 App Router,36 个 API 路由,全 TypeScript。

## 快速启动

```bash
cd "A:/AI视频生成剪辑助手"
# 确保 .env.local 存在且含 DEEPSEEK_API_KEY、TIKHUB_API_KEY 等(见 .env.example)
npm run dev    # 默认 high port, 浏览器开 http://127.0.0.1:<port>
npm run build  # 构建前必须先停 dev + rm -rf .next, 否则 PageNotFoundError 假失败
npx vitest run # 225 tests, 36 files
```

## 当前状态

| 项 | 状态 |
|---|---|
| production build | ✅ 绿 |
| 测试 (225 in 36 files) | ✅ 全绿 |
| typecheck | ✅ 绿 |
| B-roll 素材合成 | ✅ stageBrollAssets 暂存 publicDir + staticFile |
| AI 配音 (TTS) | ✅ edge-tts / SAPI 双引擎 |
| 字幕烧录 (配音时间轴) | ✅ edge-tts SRT 真实时间 + 长句分段轮播 |
| 一键全链路 | ✅ 选题→脚本→配音→成片→变体 |
| 多平台热点源 | ✅ B站真实 + 抖音(TTD自托管/TikHub) + 快手(TikHub) + YouTube(Data API v3) |
| 网页事实证据 | ✅ Exa + Firecrawl 双源,自动喂进 LLM 脚本 prompt |
| UI 重设计 | ✅ A 方案“AI 视频任务指挥舱”(Operations Bay) |
| BGM 混音 | ✅ FFmpeg 渲染后混音(无配音/配音双路径) |
| BGM 智能选曲 | ✅ 本地库 + LLM mood 匹配(零 API) |
| 发布脚手架 | ✅ 队列 + adapter 体检 + preflight + dispatch + 人工确认闸门 |
| 数据回流 | ✅ analytics ledger + 30m/24h/7d 快照建议 |
| n8n 编排 | ✅ payload 生成 + webhook 触发 + workflow JSON 导出 + retry/审批 id 映射 |
| TikTokDownloader 适配 | ✅ douyin.ts 自动路由(TTD/TikHub),TTD 补丁免费热榜实测通 |
| KS-Downloader 适配 | ✅ ks-downloader.ts 快手详情免费路径(Codex) |
| 全链路自检面板 | ✅ /api/health/self-check + 辅助面板,探 TTD/n8n/Postiz/KSD/LLM/BGM/FFmpeg/yt-dlp 四态 |
| 抖音搜索/评论免费路径 | ✅ research.ts 配 TTD_DOUYIN_COOKIE 走 TTD(/douyin/search,/comment),否则 TikHub(plumbing 已测,真实形状待 cookie 联调) |
| 快手免费热榜 | ❌ 无可建免费源(TikHub 快手热榜计费 / KSD 无热榜端点)—— 保留 TikHub,诚实不伪造 |
| **下一项** | (1)按 [docs/CONFIG_AND_LAUNCH.md](docs/CONFIG_AND_LAUNCH.md) 走完 Postiz OAuth → 填 integration_id → 真草稿联调 → (2)`npm run smoke:live` 实测端到端(已实证抖音热榜→DeepSeek 脚本→preflight 全通过) |

## 基础设施(2026-06-19 session 搭建,全在跑)

| 服务 | 端口 | 方式 | 启动/停止 |
|---|---|---|---|
| TikTokDownloader | 5555 | 原生 Python venv | `cd ~/Desktop/TikTokDownloader && .venv/Scripts/python.exe run_api.py`(不开机自启) |
| n8n | 5678 | Docker compose | `docker compose -f deployments/n8n/docker-compose.yml up -d` |
| Postiz + ES + Temporal + postgres + redis | 5000/7233 | Docker compose | `docker compose -f deployments/postiz/docker-compose.yml up -d` |

- **Postiz 本地账号已建**，登录凭据和 API key 仅保存在本地环境，不写入版本库文档。TikTok OAuth 需在 Postiz UI 配 client_key(非本项代码问题)。
- **Docker Desktop 须配代理** `settings-store.json`: `ProxyHTTPMode:manual` + Override 全指向 `http://127.0.0.1:7890`。无此 docker 出不了网(Clash TUN 劫持)。
- **TTD 免费热榜实测通**: `patches/ttd-douyin-hot.patch` 给 TTD 补了 `/douyin/hot` HTTP 路由。数据是抖音热榜话题词。
- **BGM 库**: `workspace/input/audio/{calm,cinematic,dark,funny,tech,uplifting,warm}/` 各1首 Kevin MacLeod CC-BY 曲,选曲器中文情绪词命中实测通过。

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
    page.tsx            # 单页控制台 (2781 行, 所有面板组件内联)
    globals.css         # Operations Bay 指挥舱设计系统
    layout.tsx          # 字体挂载 (next/font/local)
    fonts/              # 自托管 Sora + IBM Plex Mono woff2
    api/                # 35 个 API 路由
  lib/                  # 47 个 .ts(不含 .test.ts)
    broll.ts            # B-roll planner + stageBrollAssets
    audio-mix.ts        # BGM / narration+BGM FFmpeg mix
    bgm/library.ts      # 本地 BGM 库扫描 + LLM mood 匹配选曲
    remotion-render.ts  # Remotion 渲染入口 + publicDir 暂存
    narrated-render.ts  # 配音成片 (TTS → Remotion → 混音)
    tts/synthesize.ts   # TTS (edge-tts/SAPI 可插拔)
    full-chain.ts       # 一键全链路编排
    llm/client.ts       # LLM 客户端 (DeepSeek 默认)
    script/generate.ts  # 脚本生成 + 网页证据引用 + citedSources
    trend/sources/      # bilibili/douyin(→TTD or TikHub)/kuaishou/youtube/tiktok-downloader/tikhub
    trend/research.ts   # TikHub 关键词搜索/详情/评论(竞品研究)
    trend/evidence.ts   # Exa + Firecrawl 网页证据搜索(自动选 provider)
    publish/adapters.ts # social-auto-upload/Postiz/manual adapter 状态
    publish/queue.ts    # 待发布队列 + 人工确认闸门
    publish/preflight.ts# 发布账号联调体检(POSTIZ key + integrations probe)
    publish/dispatch.ts # approved 队列项 → Postiz draft / 命令预览
    analytics/ledger.ts # 平台数据快照 + 信号 + 建议
    orchestration/n8n.ts# n8n payload + webhook + workflow JSON 导出
  remotion/
    ScriptPackage.tsx   # 组件 (B-roll + 字幕 + 无配音/配音双模式)
    captions.ts         # 字幕引擎 (真实时间轴 + 长句分段)
    Root.tsx            # Composition 注册
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

## 纯 ops → 全部完成 ✅ (2026-06-19)

以上 5 项 ops 中 n8n/Postiz/TTD/BGM 4 项已在本 session 完成:
1. ~~n8n~~ ✅ 容器 running on 5678,workflow 已导出+导入
2. ~~Postiz~~ ✅ 全栈(含 ES+Temporal+pg+redis) running on 5000,账号/API key 自动建
3. ~~TTD~~ ✅ 原生 python 跑在 5555(非 Docker),douyin hot 实测通
4. ~~KS-Downloader adapter~~ ✅ — 快手免费详情替代已接入；热榜仍需另找源或走 TikHub
5. ~~BGM~~ ✅ workspace/input/audio/{7 moods} 已填 CC-BY 曲

## Git 注意事项

- 仓库: `https://github.com/LinXingjian365/ai-video-creator.git` (origin)
- **全局 gitconfig 有坏的 gh 助手** (`A:\GitHub CLI\gh.exe` 已删), 推代码需仓库级覆盖 credential helper:
  ```bash
  git config --local credential.helper ""
  git config --local credential.helper manager
  # 或直接用个人 access token
  ```
- 当前基线 60 commits 已推送到 `origin/feat/s1-trend-intelligence`；本轮提交后应为 61 commits ahead of main。push 失败先看 [GitHub 凭证坑](C:/Users/Administrator/.claude/projects/A--AI--------/memory/github-repo-and-credential-gotcha.md)。

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
- 把导出的 JSON 导入真实 n8n 实例，继续联调 analytics 数据源映射。
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

## 2026-06-19 Claude 更新:抖音热榜免费路径打通 (commit 93fc534)

TikHub 抖音接口计费。TikTokDownloader 能抓抖音热榜但只在交互终端、未暴露 HTTP。**本次给它 FastAPI server 补了 `/douyin/hot` 路由**: 克隆 TTD → 建 venv → 装依赖 → apply `patches/ttd-douyin-hot.patch` → `python run_api.py`(5555)。

`tiktok-downloader.ts` 适配器也按真实热榜话题结构重写了(原版假定的端点不存在+数据形状错):话题词映射成 TrendItem(hot_value=热度,view_count=播放),跨榜去重,~30s 拉四榜。

`.env.local` 已设 `TTD_ENABLED=true` + `TTD_BASE_URL=http://127.0.0.1:5555`,douyin.ts 自动路由到 TTD 免费用。

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
- 真实联调 Postiz / social-auto-upload 草稿(P5 验收剩余项)。
- 真实 n8n 实例导入 `workspace/drafts/n8n-workflow-*.json` 跑定时任务。

## Claude 更新: 网页证据自动喂进脚本 LLM (commit 3d6e0e5)

已完成:
- `src/lib/script/generate.ts`: `ScriptInput.evidence?` 透传到 LLM prompt 的"事实证据"章节, SYSTEM 指令要求融入真实数字/结论/案例并填 `citedSources` (`url + used` 说明)。
- `src/lib/full-chain.ts`: `FullChainInput.evidence?` 透传到 generateScript。
- `src/lib/schemas.ts`: `scriptGenerateSchema` / `fullChainSchema` 都加 `evidence[]`。
- `src/app/page.tsx`: `generateScript()` / `runFullChainAction()` 自动从 `evidenceReport` 取前 6 条; 脚本结果新增"事实引用"卡(青色高亮显示 LLM 实际引用的 URL + 用法); 选题字段下方显示"已挂载 N 条事实证据"提示 pill。
- 全量 169 测试绿 (+3 evidence 测试 + 1 full-chain test 补 `citedSources: []`)。

实测 DeepSeek 行为: 喂入 `Sora 2 评分 8.7 / Runway 7.9` + `Pika 73% 用户日均 5 次`两条证据,模型把 8.7 vs 7.9 写进 hook、73% 写进 beat,并在 `citedSources` 标注每条 URL 的使用方式。

## TikHub API key 实测状态 (2026-06-18)

key 已落 `.env.local`,实测覆盖:
- ✅ kuaishou 热榜 `/api/v1/kuaishou/web/hot_search_list`: 返回真数据
- ❌ douyin 关键词搜索 `/api/v1/douyin/app/v3/fetch_video_search_result`: HTTP 402 "Insufficient balance, this endpoint requires payment and does not accept free credit"

→ TikHub 账户层面的限制,**不是代码 bug**。免费额度只覆盖部分热榜接口,关键词搜索需要付费充值。**已找到完整免费替代方案**,见 `docs/FREE_ALTERNATIVES.md`。

## Claude 更新: 免费/开源替代方案文档 (2026-06-18)

**起因**: 用户指出 Postiz $29/月、TikHub 搜索充值制都是付费方案,要求找 GitHub 上的免费替代。

**调研结论** (详见 `docs/FREE_ALTERNATIVES.md`):

| 当前付费方案 | 月费 | 免费替代 | License |
|---|---|---|---|
| Postiz 托管版 | $23-99/月 | [Postiz 自托管](https://github.com/gitroomhq/postiz-app) | Apache 2.0 |
| TikHub 抖音搜索 | 充值制 | [JoeanAmier/TikTokDownloader](https://github.com/JoeanAmier/TikTokDownloader) 11.4k★ | Apache 2.0 |
| TikHub 快手 | 充值制 | [JoeanAmier/KS-Downloader](https://github.com/JoeanAmier/KS-Downloader) | Apache 2.0 |
| n8n Cloud | $24-60/月 | n8n Community Edition 自托管 | Fair Code |
| BGM 商业曲库 | 订阅制 | Pixabay/Mixkit/FreePD 本地库 (CC0) | CC0 |

**关键发现**: Postiz 本身就是 MIT Apache 2.0,$29/月只是 postiz.com 托管费;TikHub 原作者(Evil0ctal)的项目也是开源的,他停更跑去做商业版 TikHub 了,**JoeanAmier 这套是直接替代品**——Docker 一行起,5555 端口 REST API,显式支持 `/douyin/search` `/douyin/hot` `/douyin/comment` 等端点。

**全部替代方案已部署到位** (2026-06-19):
1. ~~n8n 自托管~~ ✅ — 容器 running on 5678,workflow JSON 已导出+导入
2. ~~BGM 本地库~~ ✅ — workspace/input/audio/{7 moods} 已填 Kevin MacLeod CC-BY 曲
3. ~~Postiz 自托管~~ ✅ — 全栈 6 容器 running,账号+API key 已自动建
4. ~~TikTokDownloader adapter~~ ✅ — 打补丁+douyin hot 实测通(免费),重写适配器映射话题趋势
5. **KS-Downloader adapter** ✅ — 已接入快手 URL/ID 详情免费路径；未伪造热榜，因为 KS-Downloader 未暴露 verified hot-list API

## 2026-06-19 Claude 更新: TikTokDownloader 免费抖音热榜 (重写, commit 93fc534→fdb8aae)

初版 TTD adapter(8eaa7ce)假定端点 `/douyin/hot` + 视频结构,都不对。本次:
- 给 TTD FastAPI server 补了真实 `/douyin/hot` 路由(patches/ttd-douyin-hot.patch),调内部 hot.py
- `tiktok-downloader.ts` 重写:映射热榜话题词→TrendItem,13 tests。默认超时 60s(4 榜~30s)
- 本机原生跑(Python venv,5555),不走 Docker
- 全量 194 测试绿。

## Claude 更新: BGM 本地库 + 自动选曲 (commit 87e5ce1)

已完成:
- `src/lib/bgm/library.ts`: 纯函数核心(扫描/打分/选曲分离)。7 个 mood 类别带中英同义词,
  `tagsFromPath` 把'workspace/input/audio/uplifting/sora-upbeat-electronic.mp3'抽成
  `['uplifting','tech','sora']`(同义词归一化)。`pickBgm()` 确定性打分:分数高+字典序稳定。
- `src/lib/bgm/library.test.ts`: 16 单测覆盖中/英文 mood、归一化、空库、无匹配、fallback、rankings。
- `/api/bgm/library`: GET 列库,POST 按 mood 选。
- `src/app/page.tsx`: ScriptPanel BGM 路径下新增"AI 选曲"按钮,优先用 `scriptDraft.bgm` 作 mood。

**实测验证**(真实 LLM 输出): `"轻快电子节奏，带科技感凸点"` → 命中 `[uplifting,tech]`
双关键词 → 精准选中 `pixabay-tech-upbeat-electronic.mp3`(score 2)。空库 / 无匹配场景均返回
明确 `nextActions` 指引去 pixabay/mixkit/freepd 下 CC0 mp3,**不静默挑随机文件冒充 AI 选曲**。

**用户操作流程**: 把 CC0 mp3 按曲风落到 `workspace/input/audio/<mood>/`(uplifting/calm/tech/
cinematic/warm/dark/funny),生成脚本后点"AI 选曲" → form.bgmPath 自动填好 → 渲染时混音。

---

# Codex 接手开局指南 (2026-06-19)

## 第一阶段:健康检查 (1 分钟)

在容器/服务状态不清楚时,跑这一条:
```bash
cd "A:/AI视频生成剪辑助手"
docker ps --format '{{.Names}} | {{.Status}}'
curl -s -o /dev/null -w "ttd=%{http_code}\n" --noproxy 127.0.0.1 --max-time 8 http://127.0.0.1:5555/docs
curl -s -o /dev/null -w "n8n=%{http_code}\n" --noproxy 127.0.0.1 --max-time 8 http://127.0.0.1:5678/healthz
curl -s -L -o /dev/null -w "postiz=%{http_code}\n" --noproxy localhost --max-time 10 http://localhost:5000/
git status; git rev-list --count main..HEAD; npx tsc --noEmit
```

预期:6 容器 Up,TTD 200,n8n 200,Postiz 200,tree clean,~50 commits ahead,typecheck green。

## 第二阶段:补齐缺失服务

**TTD 没在跑**(最常见 — 不自启): `cd ~/Desktop/TikTokDownloader && .venv/Scripts/python.exe run_api.py`

**Docker 容器没在跑**: `docker compose -f deployments/n8n/docker-compose.yml up -d` + `docker compose -f deployments/postiz/docker-compose.yml up -d`

**Docker 拉不了镜像**(EOF/超时):检查 `%APPDATA%/Docker/settings-store.json` 是否含 `ProxyHTTPMode:manual`+`OverrideProxyHTTP:http://127.0.0.1:7890`+`OverrideProxyHTTPS:http://127.0.0.1:7890`。弄好后 `docker desktop restart`。拉大镜像**不要用 timeout 杀**(docker 不续传单层,杀掉白下)。

**dev server 没起**: `npx next dev -p 5182` (读 .env.local,TTD/Postiz/n8n 配置自动生效)

## 第三阶段:能自主做的事(无需用户)

1. **跑趋势报告**: `curl -s --max-time 120 --noproxy 127.0.0.1 -X POST "http://127.0.0.1:5182/api/trend/report" -H "Content-Type: application/json" -d '{"platform":"douyin","category":"hot","topN":5}'` — 走 TTD 免费,~30s
2. **跑全链路脚本**: POST `/api/script/generate` → POST `/api/full-chain` → 出 Remotion 成片
3. **推 Postiz 草稿**: POST `/api/publish/dispatch` (需 integration_id,目前为空 → 返回 preview,不真发;配好 ID 后可发 draft)
4. **跑 n8n 烟测**: `npm run n8n:smoke` — 生成最小 workflow → 导入 n8n 容器 → 用一次性 n8n CLI 容器真实执行 HTTP 节点 → 结果写入 `workspace/drafts/n8n-smoke-status-result-*.json`；更深验证用 `$env:N8N_SMOKE_MODE='orchestration'; npm run n8n:smoke; Remove-Item Env:\N8N_SMOKE_MODE`，会分阶段打蓝图/readiness/workspace assets/dry-run payload，不触发真实发布。
5. **跑测试**: `npx vitest run` (225 tests,36 files)
6. **全链路自检**: 开 UI「辅助 → 全链路自检」,或 `curl http://127.0.0.1:5182/api/health/self-check`(dev server 在跑时),一眼看 TTD/n8n/Postiz/KSD/LLM/BGM/FFmpeg/yt-dlp 状态
6. **修改代码**:收窄在趋势源/脚本生成/发布适配器/add BGM/add 新平台源,不动基础设施 compose

## 第四阶段:需要用户操作才能做的事

- **push 当前提交到 GitHub**: 需确认 credential helper 不冲突(见 [[GitHub仓库与凭证坑]]),然后 `git push -u origin feat/s1-trend-intelligence`
- **Postiz 连平台拿 integration_id**: 用户用本地保存的凭据登录 http://localhost:5000 → 在 Postiz UI 连接抖音/快手/B站 OAuth → 拿到 integration_id → 填 `.env.local` 的 `POSTIZ_INTEGRATION_ID_*` → 然后 dispatch.ts 就能创建真实 draft
- **Postiz TikTok `client_key` 报错**:Postiz 自身的 TikTok OAuth 要你在其管理后台填入 TikTok Developer App 的 client_key/secret,不是本项目的代码问题。如果只是抖音(douyin)而非 TikTok,这条可忽略
- **填写更多 CC0 曲目**: 去 pixabay.com/music 或 mixkit.co 下载 mp3,按 mood 放进 `workspace/input/audio/<mood>/`,选曲器自动识别

## 关键文件速查

| 文件 | 作用 |
|---|---|
| `deployments/n8n/docker-compose.yml` | n8n 自托管 |
| `deployments/postiz/docker-compose.yml` | Postiz 全栈(含 ES/Temporal/pg/redis) |
| `patches/ttd-douyin-hot.patch` | 给 TTD 加 /douyin/hot HTTP 路由 |
| `patches/ttd-run_api.py` | TTD 非交互启动脚本 |
| `src/lib/trend/sources/tiktok-downloader.ts` | 免费抖音热榜适配器 |
| `src/lib/trend/sources/ks-downloader.ts` | 免费快手单视频详情适配器 |
| `src/lib/trend/sources/douyin.ts` | 抖音源路由(TTD_ENABLED→TTD,否则→TikHub) |
| `src/lib/orchestration/n8n.ts` | n8n workflow payload 生成+导出 |
| `scripts/n8n-smoke-test.mjs` | n8n 自托管导入+真实执行烟测 |
| `src/lib/publish/dispatch.ts` | Postiz draft dispatch |
| `src/lib/bgm/library.ts` | BGM 库扫描+选曲 |
| `workspace/input/audio/` | BGM 库 + CREDITS.md |
| `C:/Users/Administrator/.claude/projects/A--AI--------/memory/` | 项目记忆文件 |
| `C:/Users/Administrator/.claude/projects/A--AI--------/memory/project-state-2026-06-19.md` | 最终运行态快照 |
| `C:/Users/Administrator/.claude/projects/A--AI--------/memory/docker-clash-tun-and-free-douyin.md` | Clash TUN/Docker 踩坑记录 |

## Codex 更新: KS-Downloader 快手详情免费路径已接入

已完成:
- `src/lib/trend/sources/ks-downloader.ts`: 新增自托管 KS-Downloader 适配层，支持 `KSD_BASE_URL` / `KSD_DETAIL_ENDPOINT` / `KSD_COOKIE` / `KSD_PROXY`，把 `/detail/` 响应归一化为 `TrendItem`。
- `src/lib/trend/research.ts`: `platform=kuaishou` 且提供 URL/ID 时，若配置 `KSD_BASE_URL` 或 `KSD_ENABLED=true`，优先走 KSD 详情，不再强制 TikHub key；关键词搜索和评论仍走 TikHub。
- `src/app/page.tsx`: 联网素材卡片文案改为 TikHub / KSD，明确关键词/评论与快手详情的不同路径。
- `.env.example` / `docs/API.md` / `docs/FULL_CHAIN_TOOLCHAIN.md` / `docs/ROADMAP.md`: 同步 KSD 配置和边界。

边界:
- KS-Downloader 当前没有 verified 快手热榜 API，所以没有把它伪装成热榜源；快手热榜仍由 TikHub 或后续新源负责。
- 本轮验证: typecheck 绿，34 files / 207 tests 绿，production build 绿。

## Codex 更新: n8n 自托管真实执行烟测已接入

已完成:
- `scripts/n8n-smoke-test.mjs`: 生成最小 n8n workflow，导入 `n8n` Docker 容器，再用同一 compose volume 启动一次性 n8n CLI 容器执行 workflow。
- `package.json`: 新增 `npm run n8n:smoke`。
- 烟测 workflow: `Manual smoke trigger` → `HTTP Request http://host.docker.internal:5182/api/orchestration/n8n`。
- 执行结果落盘到 `workspace/drafts/n8n-smoke-status-result-*.json`，主 n8n 服务容器会在执行结束后自动重新启动。

实测:
- `npm run n8n:smoke` 成功，workflow id `39058362-94f7-4389-b2b7-661e0935090c`。
- n8n 执行状态 `success`，HTTP 节点成功返回本项目 n8n blueprint JSON。

边界:
- n8n 2.26 CLI `execute` 会和正在运行的服务抢 5679 task broker 端口；脚本采用“临时停止服务容器 → compose run 一次性 CLI 容器 → 重启服务容器”的稳定路径。
- CLI 导入后 active webhook 注册在本机 regular mode 下不稳定，因此当前 smoke 先验证真实 workflow 执行；完整生产 webhook 激活仍建议后续经 UI/API 方式联调。

## Codex 更新: n8n 分阶段 orchestration smoke 已接入

已完成:
- `scripts/n8n-smoke-test.mjs`: 增加 `N8N_SMOKE_MODE=orchestration`，默认 `status` 模式保持原最小 smoke。
- orchestration smoke 节点: `Manual orchestration smoke trigger` → `01 n8n blueprint status` → `02 Creator readiness` → `03 Workspace assets` → `04 Build n8n dry-run payload`。
- `scripts/n8n-smoke-test.test.mjs` + `vitest.config.ts`: 覆盖 status/orchestration 两种 workflow 构建，确保 dry-run payload 不带 secret。
- `docs/API.md` / `docs/ROADMAP.md` / `docs/FULL_CHAIN_TOOLCHAIN.md`: 同步新验证模式。

实测:
- `npm run n8n:smoke` 成功，status workflow id `51b18f7b-40af-4d32-be89-70137020770e`。
- `$env:N8N_SMOKE_MODE='orchestration'; npm run n8n:smoke; Remove-Item Env:\N8N_SMOKE_MODE` 成功，workflow id `eca14d17-f880-4172-92d0-7ee580401206`。
- n8n 执行状态 `success`，最终节点成功返回 `/api/orchestration/n8n` dry-run task，`secretsIncluded=false`。

边界:
- 该 smoke 不跑 `/api/full-chain`，避免在验证编排时触发长渲染/外部上传；下一步是接真实 analytics 数据源映射。

## Codex 更新: n8n workflow retry 与审批 id 映射已接入

已完成:
- `src/lib/orchestration/n8n.ts`: 导出的 n8n HTTP Request 节点统一带 `retryOnFail=true`、`maxTries=3`、`waitBetweenTries=10000`。
- `src/lib/orchestration/n8n.ts`: dispatch body 改为明确的 `REPLACE_WITH_APPROVED_QUEUE_ITEM_ID` 占位；如果导出请求带 `queueItemId`，会直接写入该 approved item id。
- `src/lib/orchestration/n8n.ts`: workflow 内新增 `Approval id mapping` sticky note，说明批准队列项、复制 id、再启用 dispatch 的步骤；dispatch/analytics 仍默认 disabled。
- `src/lib/orchestration/n8n.test.ts`: 增加 retry、占位 id、显式 queueItemId 三组单测。

边界:
- 这仍然不会自动发布；dispatch 节点必须人工启用，且后端仍要求 approved 队列项和 `CONFIRM_DRY_RUN_ONLY`。
- 下一步是把 Postiz/TikHub/手动导入的数据源映射到 analytics 节点，而不是跳过人工发布闸门。
