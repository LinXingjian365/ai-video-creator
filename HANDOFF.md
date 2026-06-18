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
| 多平台热点源 | ✅ (B站真实 + YouTube/抖音诚实降级) |
| UI 重设计 | ✅ Midnight Neon 暗夜霓虹 |
| **BGM 混音** | **← 下一项** |
| 平台发布脚手架 | 待开始 |
| 数据回流 | 待开始 |

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
    remotion-render.ts  # Remotion 渲染入口 + publicDir 暂存逻辑
    narrated-render.ts  # 配音成片 (TTS → Remotion → ffmpeg 混音)
    tts/synthesize.ts   # TTS 合成 (edge-tts/SAPI 可插拔)
    full-chain.ts       # 一键全链路编排
    llm/client.ts       # LLM 客户端 (DeepSeek 默认)
  remotion/
    ScriptPackage.tsx   # Remotion 组件 (B-roll + 字幕 + 无配音/配音双模式)
    captions.ts         # 字幕引擎 (真实时间轴 + 长句分段)
    Root.tsx            # Remotion Composition 注册
```

## 下一步: BGM 混音 (优先级②)

**目标**: 成片混入背景音乐。

**入口点**:
- `src/lib/narrated-render.ts`: 配音版成片 (已有 `ffmpeg -i video.mp4 -i audio.aac -map 0:v -map 1:a` 混音逻辑可参考)
- `src/lib/remotion-render.ts`: 无声版成片 (无 TTS 口播)

**参考现有混音**: `narrated-render.ts` 用 `ffmpeg -filter_complex` 做视频轨+音频轨混音。BGM 同理: 拿成片 mp4 + BGM 音频 → `amix` 或 `amerge` → 输出双流 mp4。

**BGM 来源思路**:
1. 让 LLM 在脚本生成时推荐 BGM 曲风 (当前 `ScriptDraft.bgm` 字段已有)
2. 下载免版权 BGM (Pixabay Music API: `https://pixabay.com/api/videos/?key=...`, 或本地库存)
3. `src/lib/remotion-render.ts` 渲染时把 BGM 路径传给 ScriptPackage 组件 (`<Audio>` component), 或者在渲染后用 ffmpeg 混音

**验证方式**: 渲染一段 15s 配音成片 → ffmpeg 混入 BGM → ffprobe 确认双流输出 → 浏览器播放。

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
