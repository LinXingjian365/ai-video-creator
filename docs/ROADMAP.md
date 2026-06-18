# 生产化路线图

## P0：把本地闭环打稳

状态：基本完成。

- 本地 UI 可点击。
- FFmpeg info/clip/merge/split 可用。
- 自动模拟剪辑可生成测试视频、粗剪 MP4、决策 JSON、剪映计划 JSON。
- typecheck/build 通过。

剩余：

- 统一所有 route 的 Zod 400 错误响应。
- 增加文件存在性和路径安全提示。
- 任务队列从内存升级为本地 SQLite 或 JSONL。

## P1：接入真实素材和分析

目标：从真实参考视频到结构化剪辑决策。

- 接 yt-dlp：导入视频、封面、字幕、元数据。状态：API/UI 已接入，py312 环境 `python -m yt_dlp` 已验证可用；公开视频导入可生成 manifest。
- 接 faster-whisper：生成字幕和时间戳。状态：py312 已安装并接入 `/api/materials/analyze` 的 `transcriptionMode=auto|faster-whisper`，字幕文件优先，缺字幕时可本地 ASR。
- 接 PySceneDetect：镜头边界和缩略图。状态：py312 已安装并纳入 readiness；`/api/materials/analyze` 已支持 `sceneBackend=auto|pyscenedetect|ffmpeg`，强制 PySceneDetect 已用红蓝硬切测试视频验证 2000ms 切点。
- 接静音检测/Auto-Editor：静音段、口播停顿、快剪建议。状态：已接 FFmpeg silencedetect 基线；Auto-Editor 已纳入 readiness，并已接入 `autoEditor` preview 统计信号，不直接修改视频。
- 统一生成 `workspace/drafts/*-analysis.json`。
- 从 `material-analysis-*.json` 驱动 `/api/auto/render` 自动粗剪。状态：已接入，支持传具体 JSON 或 `workspace/drafts` 目录自动取最新。

验收：

- 给一个本地视频或公开视频链接，能生成转写、场景列表、静音/有声段、候选切点。状态：本地视频 + 字幕文件/faster-whisper 可选 ASR + PySceneDetect/FFmpeg 场景检测 + FFmpeg 静音基线 + Auto-Editor preview 已可生成 `material-analysis-*.json`。
- 给一个 `material-analysis-*.json`，能生成 rough cut MP4 和 JianYing plan JSON。状态：已接入 `/api/auto/render` 和“自动剪辑”UI 按钮。

## P2：接入热点和选题

目标：输入账号方向，输出可验证的选题池。

- 接 TikHub 或平台 MCP：搜索热点、竞品、评论、标题。
- 接 Exa/Firecrawl：补网页资料、案例、脚本事实依据。
- 输出选题评分、参考链接、拆解要点。

验收：

- 输入赛道和人群，生成 20 个选题，每个选题有参考证据和拍摄建议。

## P3：Remotion 图文包装

目标：让粗剪不只是拼接，而有可复用的视频包装层。

- 新增 Remotion 子项目。状态：已接 `src/remotion/*`，包含 `ScriptPackageVertical` 和 `ScriptPackageWide` 两个 composition。
- 建字幕组件、标题卡、步骤卡、数据卡、片尾关注组件。状态：已完成脚本包装 MVP：标题、钩子、分镜字幕、标签、进度条；数据卡/片尾关注后续增强。
- 从自动剪辑决策 JSON 生成 Remotion props。状态：已从脚本分镜 props 渲染，后续接 auto-plan/material-analysis props。
- 输出 9:16、16:9、1:1 多平台版本。状态：已接 FFmpeg 平台版本导出；Remotion 已实测 9:16 输出 MP4。
- BGM 混音。状态：已接 `src/lib/audio-mix.ts`，Remotion 无配音成片可混入本地 BGM；AI 配音成片可用 `amix` 混合口播+BGM，并在一键全链路 UI 暴露音量参数。

验收：

- 同一条内容能输出抖音、快手、B站不同尺寸版本。状态：脚本包装视频已实测输出 1080x1920 H.264/AAC 45 秒 MP4；16:9 composition 已注册，1:1 可复用 FFmpeg variants；BGM 混音已通过 FFmpeg/FFprobe 验证路径覆盖。

## P4：JianYing MCP 真实草稿

目标：生成剪映可编辑工程，不只是计划 JSON。

- 安装并配置 `hey-jian-wei/jianying-mcp`。
- 把当前 JianYing plan JSON 映射到 MCP 工具调用。
- 支持视频轨、字幕轨、音频轨、贴纸/转场建议。

验收：

- UI 一键生成本地剪映草稿，并能在剪映里继续编辑。

## P5：发布矩阵和复盘

目标：发布不是最后一步，数据回流驱动下一轮内容。

- 接 social-auto-upload 做国内平台 dry-run。状态：已建立本地发布队列、adapter 状态检查和人工确认闸门；已生成 social-auto-upload 命令预览，仍不执行外部上传。
- 接 Postiz 做多平台排程候选。状态：已接 Postiz Public API 草稿 adapter；默认只预览，`PUBLISH_LIVE_ENABLED=true` 时只创建 `draft`，不直接真发。
- 接 n8n 编排采集、剪辑、发布、复盘工作流。状态：已接 `/api/orchestration/n8n`、Review UI 编排按钮、dry-run payload 和确认后 webhook 触发；下一步导入真实 n8n workflow 并跑定时任务。
- 建 30 分钟、24 小时、7 天复盘报告。状态：已接本地 analytics ledger、指标导入、信号计算和下一步动作建议。

验收：

- 发布包包含视频、标题、简介、标签、封面、发布时间建议。
- 发布前可生成抖音/快手/B站/方版视频文件。状态：已接 `/api/video/variants` 和 UI 入口。
- 真发前必须人工确认。状态：已接 `/api/publish/queue` 和 `/api/publish/approve`，确认口令为 `CONFIRM_DRY_RUN_ONLY`，当前仍不真发。
- 发布后回流播放、完播、点赞、评论、涨粉等指标。状态：已接 `/api/analytics/import` 和运营复盘 UI，真实平台自动拉取待接。

## P6：生产级工程

目标：项目可以长期跑，不靠一次性脚本。

- Git 仓库初始化。
- SQLite/Prisma 或 LiteFS 持久化任务和资产。
- 日志、错误追踪、重试。
- 本地模型和云模型可切换。
- 权限和密钥管理。
- E2E 测试覆盖核心链路。
