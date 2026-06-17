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

- 接 yt-dlp：导入视频、封面、字幕、元数据。状态：API/UI 已接入，本机 `python -m yt_dlp` 已验证可用；公开视频导入可生成 manifest。
- 接 faster-whisper：生成字幕和时间戳。状态：下一步增强；当前可先读取 yt-dlp 字幕文件。
- 接 PySceneDetect：镜头边界和缩略图。状态：下一步增强；当前已接 FFmpeg scene detect 基线。
- 接静音检测/Auto-Editor：静音段、口播停顿、快剪建议。状态：已接 FFmpeg silencedetect 基线，Auto-Editor 待增强。
- 统一生成 `workspace/drafts/*-analysis.json`。
- 从 `material-analysis-*.json` 驱动 `/api/auto/render` 自动粗剪。状态：已接入，支持传具体 JSON 或 `workspace/drafts` 目录自动取最新。

验收：

- 给一个本地视频或公开视频链接，能生成转写、场景列表、静音/有声段、候选切点。状态：本地视频 + 字幕文件/FFmpeg 场景和静音基线已可生成 `material-analysis-*.json`。
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

- 新增 Remotion 子项目。
- 建字幕组件、标题卡、步骤卡、数据卡、片尾关注组件。
- 从自动剪辑决策 JSON 生成 Remotion props。
- 输出 9:16、16:9、1:1 多平台版本。状态：已接 FFmpeg 平台版本导出，Remotion 包装层待增强。

验收：

- 同一条内容能输出抖音、快手、B站不同尺寸版本。

## P4：JianYing MCP 真实草稿

目标：生成剪映可编辑工程，不只是计划 JSON。

- 安装并配置 `hey-jian-wei/jianying-mcp`。
- 把当前 JianYing plan JSON 映射到 MCP 工具调用。
- 支持视频轨、字幕轨、音频轨、贴纸/转场建议。

验收：

- UI 一键生成本地剪映草稿，并能在剪映里继续编辑。

## P5：发布矩阵和复盘

目标：发布不是最后一步，数据回流驱动下一轮内容。

- 接 social-auto-upload 做国内平台 dry-run。
- 接 Postiz 做多平台排程候选。
- 接 n8n 编排采集、剪辑、发布、复盘工作流。
- 建 30 分钟、24 小时、7 天复盘报告。

验收：

- 发布包包含视频、标题、简介、标签、封面、发布时间建议。
- 发布前可生成抖音/快手/B站/方版视频文件。状态：已接 `/api/video/variants` 和 UI 入口。
- 真发前必须人工确认。
- 发布后回流播放、完播、点赞、评论、涨粉等指标。

## P6：生产级工程

目标：项目可以长期跑，不靠一次性脚本。

- Git 仓库初始化。
- SQLite/Prisma 或 LiteFS 持久化任务和资产。
- 日志、错误追踪、重试。
- 本地模型和云模型可切换。
- 权限和密钥管理。
- E2E 测试覆盖核心链路。
