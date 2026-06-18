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
| 热点搜索 | Bilibili public ranking、TikHub API、Exa、Firecrawl | B站真实榜单、抖音/快手/B站/网页热点、标题、链接、评论、搜索结果 | 已落地 B站公开排行榜与热门 fallback；其他源已有配置位和集成目录 | 配置 `BILI_COOKIE` 可降低 B站风控；继续补 TikHub/Exa/Firecrawl 真实采集 route |
| 网页/素材采集 | Firecrawl、Exa、yt-dlp | 抓网页、搜资料、导入公开视频素材/字幕/封面/元数据 | 已接 `/api/materials/import`，py312 已安装 yt-dlp，会生成素材 manifest | 按需配置 `YTDLP_COOKIES_PATH`，遵守版权和平台规则 |
| 爆款拆解 | LLM planner、FFmpeg scene/silence detect、PySceneDetect、OpenTimelineIO | 分析开头、节奏、镜头、结构、时间线 | 已有 `creator-suite`、`auto-plan` 和 `/api/materials/analyze`，含字幕/faster-whisper 可选 ASR、PySceneDetect/FFmpeg 场景和静音/有声段信号 | 下一步接 OpenTimelineIO |
| AI 模型网关 | DeepSeek、Doubao Ark、Claude gateway、GPT gateway | 爆火逻辑解释、选题卡、脚本/计划生成 | DeepSeek 已作为默认 LLM provider 接入；Ark/Claude/GPT gateway 已预留 env 和 client 分支 | 配置对应 API key 后逐个跑真实连通测试 |
| 语音转写 | faster-whisper、OpenAI Whisper、WhisperX | 生成字幕、字级时间戳、口播切点 | py312 已安装 faster-whisper，`/api/materials/analyze` 可在缺字幕时本地 ASR | 首次使用会下载 Whisper 模型；长视频建议 tiny/base 起步 |
| 场景检测 | FFmpeg scene detect、PySceneDetect | 镜头边界、场景缩略图、自动分段 | 已接 FFmpeg 基线；py312 已安装 PySceneDetect，`sceneBackend` 已能切换/自动回退 | 下一步加场景缩略图 |
| 静音快剪 | FFmpeg silencedetect、Auto-Editor | 自动去停顿、口播快剪 | 已接 FFmpeg 静音检测基线；py312 已安装 Auto-Editor，analysis JSON 已包含 Auto-Editor preview 信号 | 下一步接 timeline export |
| 本地粗剪 | FFmpeg、fluent-ffmpeg | info、clip、merge、split、rough cut、多比例导出 | 已内置并通过 UI 验证；可读取 `material-analysis-*.json` candidate clips 自动粗剪；已接平台版本导出 | 继续补复杂滤镜和字幕烧录 |
| 音频混音 | FFmpeg amix / AAC mux | 本地 BGM、AI 口播、音量平衡、循环补齐 | 已接 `src/lib/audio-mix.ts`；Remotion 无配音视频可混入 BGM，AI 配音视频可混合口播+BGM；UI 暴露 BGM/口播音量 | 下一步接免版权 BGM 库和自动选曲 |
| 图文包装 | Remotion | React 组件化字幕、标题卡、数据卡、片尾 | 已建 `src/remotion` 模板和 `/api/remotion/render`，脚本包装 MP4 已实测输出，支持渲染后 BGM 混音 | 下一步把素材粗剪作为底层视频并叠加动态图文包装 |
| 可编辑草稿 | JianYing MCP | 生成剪映可编辑草稿、轨道、字幕、转场 | 已生成 JianYing plan JSON | 配置 JianYing MCP 并把 plan 映射到真实 MCP 调用 |
| 发布矩阵 | FFmpeg variants、social-auto-upload、Postiz、n8n | 抖音/快手/B站/多平台发布、排程 | 已有 env 配置位、发布矩阵计划、平台视频版本导出、本地发布队列、adapter 状态检查、人工确认闸门、Postiz draft adapter 和 social-auto-upload 命令预览 | 真实账号联调，继续默认 dry-run |
| 自动编排 | n8n | 把采集、剪辑、发布、复盘串成工作流 | 已有 `N8N_WEBHOOK_URL`/`N8N_WEBHOOK_SECRET`/`APP_BASE_URL` 配置位，已接 `/api/orchestration/n8n` dry-run payload、确认口令和 webhook 触发，UI 可点击执行 | 导入真实 n8n workflow，设置定时任务和失败重试 |
| 数据复盘 | 平台 analytics、Postiz、TikHub | 30 分钟/24 小时数据回流和下一轮决策 | 已接本地 analytics ledger、指标导入、信号计算和下一步动作建议 | 接真实平台数据源自动同步 |

## 核心工具来源与成熟度

| 工具 | 来源 | 成熟度判断 | 采用策略 |
|---|---|---|---|
| FFmpeg | https://ffmpeg.org/ | 视频处理事实标准，稳定、跨平台 | 已内置为本地核心能力 |
| fluent-ffmpeg | https://github.com/fluent-ffmpeg/node-fluent-ffmpeg | Node FFmpeg 包装层，适合 Next API 调用 | 已内置 |
| yt-dlp | https://github.com/yt-dlp/yt-dlp | 高活跃视频下载工具，适合参考素材导入 | 已接 API route，负责素材、封面、字幕、info.json、manifest |
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
| Bilibili web-interface | https://api.bilibili.com | B站公开 Web API，可提供分区排行榜和热门视频信号 | 已接入 S1 Trend Intelligence，带请求超时、重试和热门 fallback |

## 当前项目已落地模块

- `src/lib/ffmpeg.ts`：视频信息、裁剪、合并、分割、测试视频生成。
- `src/lib/tasks.ts`：内存任务队列，支持状态、进度、日志、结果、错误。
- `src/lib/creator-toolkit.ts`：全链路工具目录。
- `src/lib/creator-suite.ts`：热点、选题、脚本、素材、蓝图、发布、复盘计划。
- `src/lib/auto-plan.ts`：自动剪辑决策 JSON。
- `src/lib/auto-render.ts`：按计划或素材分析 candidate clips 裁剪、合并，输出粗剪视频和剪映计划。
- `src/lib/platform-variants.ts`：把粗剪视频导出为抖音/快手 9:16、B站 16:9 和 1:1 方版。
- `src/lib/integrations.ts`：成熟工具集成目录。
- `src/lib/trend/*`：B站真实趋势源、确定性评分、可选 LLM 爆火逻辑分析。
- `src/lib/llm/client.ts`：DeepSeek 默认 LLM 客户端，兼容 Doubao Ark、Claude gateway、GPT gateway 扩展。
- `src/lib/materials/yt-dlp.ts`：公开视频参考素材导入、字幕/封面/metadata 保存、manifest 生成。
- `src/lib/materials/analysis.ts`：读取 manifest/视频，解析字幕，FFmpeg 场景检测和静音检测，生成候选切点。
- `src/app/page.tsx`：可点击的本地 Web 控制台。

## 当前项目未完全落地模块

这些不是忘了，而是需要外部账号、API、二进制工具或平台登录态：

- OCR/视觉批处理。
- PySceneDetect 缩略图/Auto-Editor timeline export。
- Remotion 与素材粗剪合成的高级模板。
- JianYing MCP 真实调用。
- social-auto-upload/Postiz 真实发布 dry-run。
- 发布后数据回流。

## 采用原则

1. 本地优先：用户素材默认留在 `workspace/`。
2. 成熟工具优先：视频处理、转写、场景检测、发布编排都不从零造轮子。
3. 可替换：每个阶段用结构化 JSON 交接，方便替换工具。
4. 先 dry-run 后真发：发布能力必须先支持模拟、校验、人工确认。
5. 合规优先：参考爆款只拆结构，不直接搬运未授权素材。
