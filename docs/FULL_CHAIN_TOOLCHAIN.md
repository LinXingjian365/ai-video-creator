# 全链路成熟工具链选型

这份文档回答一个核心问题：全流程所有模块是否都找了成熟、高可用、可落地的 GitHub 或现成工具。

结论：选型覆盖已经完成，当前工程已实现本地剪辑闭环和接入目录；但不是每个外部工具都已经安装、授权、真实联调。生产化需要按下表逐个接入凭据、运行环境和平台账号。

## 总体链路

```mermaid
flowchart LR
  A["热点与赛道扫描"] --> B["爆款参考采集"]
  B --> C["素材下载/导入"]
  C --> D["转写、OCR、场景检测"]
  D --> E["爆款逻辑拆解"]
  E --> F["选题、脚本、分镜"]
  F --> G["自动剪辑决策 JSON"]
  G --> H["FFmpeg 粗剪"]
  H --> I["Remotion/剪映精修"]
  I --> J["发布矩阵与定时"]
  J --> K["数据复盘与下一轮选题"]
```

## 工具链矩阵

| 阶段 | 推荐成熟工具 | 用途 | 当前项目状态 | 生产化条件 |
|---|---|---|---|---|
| 热点搜索 | TikHub API、Exa、Firecrawl | 抖音/快手/B站/网页热点、标题、链接、评论、搜索结果 | 已有 `.env.example` 配置位和集成目录 | 配置 API Key，补真实采集 route |
| 网页/素材采集 | Firecrawl、Exa、yt-dlp | 抓网页、搜资料、下载公开视频素材/字幕/封面 | 已规划为素材入口 | 安装 yt-dlp，处理 cookies 和版权规则 |
| 爆款拆解 | LLM planner、PySceneDetect、OpenTimelineIO | 分析开头、节奏、镜头、结构、时间线 | 已有 `creator-suite` 和 `auto-plan` 结构化计划 | 接真实参考视频和转写结果 |
| 语音转写 | faster-whisper、OpenAI Whisper、WhisperX | 生成字幕、字级时间戳、口播切点 | 已在工具目录推荐，未接真实 ASR | 安装 Python/模型或配置云 ASR |
| 场景检测 | PySceneDetect | 镜头边界、场景缩略图、自动分段 | 已推荐，未接真实执行 | 安装 `scenedetect[opencv]` |
| 静音快剪 | Auto-Editor | 自动去停顿、口播快剪 | 已推荐，未接真实执行 | 安装 `auto-editor` 并加 review 阈值 |
| 本地粗剪 | FFmpeg、fluent-ffmpeg | info、clip、merge、split、rough cut | 已内置并通过 UI 验证 | 继续补复杂滤镜和字幕烧录 |
| 图文包装 | Remotion | React 组件化字幕、标题卡、数据卡、片尾 | 已推荐，未建 Remotion 子项目 | 建 `remotion/` package 和模板 |
| 可编辑草稿 | JianYing MCP | 生成剪映可编辑草稿、轨道、字幕、转场 | 已生成 JianYing plan JSON | 配置 JianYing MCP 并把 plan 映射到真实 MCP 调用 |
| 发布矩阵 | social-auto-upload、Postiz、n8n | 抖音/快手/B站/多平台发布、排程 | 已有 env 配置位和发布矩阵计划 | 配置账号、登录态、dry-run、发布审核 |
| 自动编排 | n8n | 把采集、剪辑、发布、复盘串成工作流 | 已有 `N8N_WEBHOOK_URL` 配置位 | 创建 n8n 工作流并接 webhook |
| 数据复盘 | 平台 analytics、Postiz、TikHub | 30 分钟/24 小时数据回流和下一轮决策 | 已有复盘策略生成 | 接真实平台数据源 |

## 核心工具来源与成熟度

| 工具 | 来源 | 成熟度判断 | 采用策略 |
|---|---|---|---|
| FFmpeg | https://ffmpeg.org/ | 视频处理事实标准，稳定、跨平台 | 已内置为本地核心能力 |
| fluent-ffmpeg | https://github.com/fluent-ffmpeg/node-fluent-ffmpeg | Node FFmpeg 包装层，适合 Next API 调用 | 已内置 |
| yt-dlp | https://github.com/yt-dlp/yt-dlp | 高活跃视频下载工具，适合参考素材导入 | 下一阶段接入 |
| OpenAI Whisper | https://github.com/openai/whisper | 通用语音识别基础工具 | 推荐作为 ASR 标准 |
| faster-whisper | https://github.com/SYSTRAN/faster-whisper | Whisper 高性能实现 | 推荐本地优先 |
| PySceneDetect | https://github.com/Breakthrough/PySceneDetect | 成熟场景检测工具 | 推荐接入镜头分割 |
| Auto-Editor | https://github.com/WyattBlue/auto-editor | 成熟自动静音剪辑工具 | 推荐接入口播快剪 |
| Remotion | https://github.com/remotion-dev/remotion | React 程序化视频渲染生态 | 推荐接图文包装 |
| OpenTimelineIO | https://github.com/AcademySoftwareFoundation/OpenTimelineIO | 影视时间线交换标准 | 推荐做导出/互通层 |
| JianYing MCP | https://github.com/hey-jian-wei/jianying-mcp | 剪映草稿 MCP 半成品/成品工具 | 推荐做可编辑草稿桥 |
| n8n | https://github.com/n8n-io/n8n | 成熟自动化编排平台 | 推荐做全链路工作流 |
| Postiz | https://github.com/gitroomhq/postiz-app | 开源社媒排程与分析平台 | 推荐做发布/排程候选 |
| social-auto-upload | https://github.com/dreammis/social-auto-upload | 面向国内平台的自动上传工具 | 推荐做抖音/快手/B站发布候选 |

## 当前项目已落地模块

- `src/lib/ffmpeg.ts`：视频信息、裁剪、合并、分割、测试视频生成。
- `src/lib/tasks.ts`：内存任务队列，支持状态、进度、日志、结果、错误。
- `src/lib/creator-toolkit.ts`：全链路工具目录。
- `src/lib/creator-suite.ts`：热点、选题、脚本、素材、蓝图、发布、复盘计划。
- `src/lib/auto-plan.ts`：自动剪辑决策 JSON。
- `src/lib/auto-render.ts`：按计划裁剪、合并，输出粗剪视频和剪映计划。
- `src/lib/integrations.ts`：成熟工具集成目录。
- `src/app/page.tsx`：可点击的本地 Web 控制台。

## 当前项目未完全落地模块

这些不是忘了，而是需要外部账号、API、二进制工具或平台登录态：

- 真实热点数据抓取。
- 真实 yt-dlp 参考视频导入。
- 真实 ASR/OCR 批处理。
- PySceneDetect/Auto-Editor 子进程封装。
- Remotion 子项目和模板渲染。
- JianYing MCP 真实调用。
- social-auto-upload/Postiz 真实发布 dry-run。
- 发布后数据回流。

## 采用原则

1. 本地优先：用户素材默认留在 `workspace/`。
2. 成熟工具优先：视频处理、转写、场景检测、发布编排都不从零造轮子。
3. 可替换：每个阶段用结构化 JSON 交接，方便替换工具。
4. 先 dry-run 后真发：发布能力必须先支持模拟、校验、人工确认。
5. 合规优先：参考爆款只拆结构，不直接搬运未授权素材。
