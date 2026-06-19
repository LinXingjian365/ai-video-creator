# API 与本地调用说明

本项目 API 都运行在 Next.js App Router 下。开发服务器默认示例：

```text
http://127.0.0.1:5182
```

## 任务查询

### GET `/api/tasks`

返回当前内存任务列表。

### GET `/api/tasks?id=<taskId>`

返回单个任务。

## 视频处理

### POST `/api/video/info`

```json
{
  "inputPath": "workspace/input/demo.mp4"
}
```

返回视频 duration、width、height、fps、bitrate、format、codec、size。

### POST `/api/video/clip`

```json
{
  "inputPath": "workspace/input/demo.mp4",
  "outputPath": "workspace/output/clip.mp4",
  "startMs": 0,
  "endMs": 5000,
  "quality": "fast",
  "videoCodec": "libx264",
  "audioCodec": "aac"
}
```

### POST `/api/video/merge`

```json
{
  "inputPaths": [
    "workspace/output/a.mp4",
    "workspace/output/b.mp4"
  ],
  "outputPath": "workspace/output/merged.mp4",
  "quality": "fast",
  "videoCodec": "libx264",
  "audioCodec": "aac"
}
```

### POST `/api/video/split`

按固定时长分割：

```json
{
  "inputPath": "workspace/input/demo.mp4",
  "outputDir": "workspace/output/splits",
  "mode": "duration",
  "durationMs": 5000
}
```

按段数分割：

```json
{
  "inputPath": "workspace/input/demo.mp4",
  "outputDir": "workspace/output/splits",
  "mode": "segmentCount",
  "segmentCount": 4
}
```

### GET `/api/video/formats`

返回当前建议的视频格式、平台比例、编码方案。

### POST `/api/video/variants`

把一个粗剪视频导出为平台发布版本。`inputPath` 可以是具体视频，也可以是 `workspace/output` 目录；传目录时自动读取最新视频。输出目录必须位于 `workspace/output` 下。

```json
{
  "inputPath": "workspace/output",
  "title": "平台发布版本",
  "targets": ["douyin", "kuaishou", "bilibili", "square"],
  "mode": "crop"
}
```

目标尺寸：

```text
douyin   1080x1920
kuaishou 1080x1920
bilibili 1920x1080
square   1080x1080
```

返回的 task result 包含 `outputDir`、各平台 `variants` 和 `platform-variants.json` manifest。

## 自动剪辑

### POST `/api/auto/plan`

生成自动剪辑决策 JSON。

```json
{
  "projectTitle": "AI剪辑工具实战",
  "goal": "涨粉、完播、转化",
  "platform": "douyin",
  "sourceSummary": "口播素材、屏幕录制、爆款参考",
  "targetDurationMs": 9000
}
```

### POST `/api/auto/render`

按 `clips`、`planPath` 或 `analysisPath` 执行真实粗剪。`analysisPath` 可以是具体 `material-analysis-*.json`，也可以是 `workspace/drafts` 目录；传目录时会自动读取最新分析文件里的 candidate clips。

```json
{
  "projectTitle": "自动粗剪",
  "inputPath": "workspace/input/demo.mp4",
  "clips": [
    {
      "inputPath": "workspace/input/demo.mp4",
      "startMs": 0,
      "endMs": 2500,
      "label": "hook"
    },
    {
      "inputPath": "workspace/input/demo.mp4",
      "startMs": 2500,
      "endMs": 5000,
      "label": "method"
    }
  ],
  "outputPath": "workspace/output/rough-cut.mp4"
}
```

用素材分析结果直接粗剪：

```json
{
  "projectTitle": "分析结果粗剪",
  "analysisPath": "workspace/drafts"
}
```

返回的 task result 会包含 `outputPath`、`draftPlanPath`、实际使用的 `clips` 和生成的 JianYing plan。

### POST `/api/auto/simulate`

一键生成测试视频、自动决策、粗剪 MP4 和剪映计划 JSON。适合验证系统是否真的能跑。

```json
{
  "projectTitle": "一键模拟自动剪辑"
}
```

PowerShell 示例：

```powershell
$body = @{ projectTitle = "一键模拟自动剪辑" } | ConvertTo-Json
Invoke-RestMethod -Method Post -Uri "http://127.0.0.1:5182/api/auto/simulate" -ContentType "application/json" -Body $body
```

## 创作者全链路

### POST `/api/trend/report`

抓取真实平台热点，计算潜力分和置信度，并在 LLM 可用时生成爆火逻辑分析。该接口会创建 `trend-report` task，并在当前请求内完成后返回最终 task。`platform` 支持 `bilibili`、`douyin`、`kuaishou`、`youtube`。

数据源说明：
- `bilibili`：优先 B 站公开 ranking API，`all` 会回退 popular。
- `douyin`：通过 TikHub `GET /api/v1/douyin/web/fetch_hot_search_result`，需要 `TIKHUB_API_KEY`。
- `kuaishou`：通过 TikHub `GET /api/v1/kuaishou/web/fetch_kuaishou_hot_list_v2`，需要 `TIKHUB_API_KEY`，`category` 可传 `hot/entertainment/society/useful/challenge/search` 或数字 board type。
- `youtube`：通过 YouTube Data API v3 mostPopular，需要 `YOUTUBE_API_KEY`。

TikHub 请求使用 `Authorization: Bearer <token>`，endpoint 可通过 `TIKHUB_ENDPOINT_DOUYIN` / `TIKHUB_ENDPOINT_KUAISHOU` 覆盖；响应会被归一化成统一 `TrendItem`，再进入本地评分和 DeepSeek 分析。

```json
{
  "platform": "bilibili",
  "category": "all",
  "topN": 3
}
```

返回重点字段：

```json
{
  "task": {
    "status": "completed",
    "result": {
      "platform": "bilibili",
      "itemCount": 3,
      "aiStatus": "ok",
      "items": [
        {
          "title": "真实 B站视频标题",
          "potentialScore": 96,
          "confidence": 91
        }
      ]
    }
  }
}
```



配置说明：

- `BILI_COOKIE` 可选。B站返回风控码时建议配置。
- `BILI_TIMEOUT_MS` 控制 B站请求超时，默认 10000。
- `LLM_PROVIDER=deepseek` 是当前默认 AI 分析模式，配置 `DEEPSEEK_API_KEY`、可选 `DEEPSEEK_BASE_URL`、`DEEPSEEK_MODEL`。
- 后续可切换 `LLM_PROVIDER=doubao-ark`、`claude-gateway`、`gpt-gateway`，分别使用 `ARK_*`、`ANTHROPIC_*`、`GPT_GATEWAY_*` 环境变量。
- LLM 失败会降级为真实榜单和确定性评分，不会编造 AI 结果。

### POST `/api/trend/research`

用 TikHub 做抖音/快手竞品研究：关键词搜索、单视频详情、评论样本，并归一化成 `TrendItem`、素材候选和下一步动作。快手单视频详情如果配置了本地 KS-Downloader，会优先走免费自托管 `POST /detail/`，不强制 TikHub key。该接口创建 `trend-research` task，并在当前请求内返回最终 task。

```json
{
  "platform": "douyin",
  "query": "AI剪辑",
  "url": "https://www.douyin.com/video/...",
  "itemId": "7380000000000000000",
  "includeComments": true,
  "limit": 10
}
```

`query`、`url`、`itemId` 至少传一个。`url` 可以是平台分享链接或分享文本；快手链接默认按 TikHub 的 `share_text` 参数请求；若已配置 `KSD_BASE_URL` 或 `KSD_ENABLED=true`，快手 URL/ID 详情会改走 KS-Downloader。

TikHub endpoint 默认值：

```text
抖音搜索      /api/v1/douyin/app/v3/fetch_video_search_result
抖音链接详情  /api/v1/hybrid/video_data
抖音 ID 详情  /api/v1/douyin/app/v3/fetch_one_video
抖音评论      /api/v1/douyin/app/v3/fetch_video_comments
快手搜索      /api/v1/kuaishou/app/search_video_v2
快手链接详情  /api/v1/kuaishou/app/fetch_one_video_by_url
快手 ID 详情  /api/v1/kuaishou/app/fetch_one_video
快手评论      /api/v1/kuaishou/app/fetch_one_video_comment
```

这些路径可用 `.env` 里的 `TIKHUB_ENDPOINT_DOUYIN_SEARCH`、`TIKHUB_ENDPOINT_DOUYIN_DETAIL_BY_URL`、`TIKHUB_ENDPOINT_DOUYIN_DETAIL_BY_ID`、`TIKHUB_ENDPOINT_DOUYIN_COMMENTS`、`TIKHUB_ENDPOINT_KUAISHOU_SEARCH`、`TIKHUB_ENDPOINT_KUAISHOU_DETAIL_BY_URL`、`TIKHUB_ENDPOINT_KUAISHOU_DETAIL_BY_ID`、`TIKHUB_ENDPOINT_KUAISHOU_COMMENTS` 覆盖。

KS-Downloader 快手免费详情配置：

```text
KSD_ENABLED=true
KSD_BASE_URL=http://127.0.0.1:5557
KSD_DETAIL_ENDPOINT=/detail/
KSD_COOKIE=
KSD_PROXY=
```

当前只把 KS-Downloader 用作快手 URL/ID 详情源；没有把它伪装成快手热榜源。

返回重点字段：

```json
{
  "task": {
    "status": "completed",
    "result": {
      "platform": "douyin",
      "searchItems": [],
      "detail": {},
      "comments": [],
      "materialCandidates": [
        {
          "title": "参考标题",
          "url": "https://...",
          "source": "search"
        }
      ],
      "nextActions": []
    }
  }
}
```

注意：该接口只做热点/结构研究和候选链接整理；素材导入仍需你确认有权使用，再走 `/api/materials/import`。

### POST `/api/materials/import`

用 `yt-dlp` 导入你有权下载或分析的公开视频素材，落盘到 `workspace/input/references/<collection>`，并生成 `manifest.json`。会保存媒体文件、封面、字幕、自动字幕和 `info.json`。

```json
{
  "url": "https://www.bilibili.com/video/...",
  "collectionName": "爆款参考素材",
  "quality": "720p",
  "allowPlaylist": false,
  "writeSubtitles": true,
  "writeAutoSubtitles": true,
  "subtitleLanguages": ["zh-Hans", "zh", "en"]
}
```

质量选项：

```text
best | 1080p | 720p | 480p | audio | metadata
```

配置说明：

- 需要本机安装 `yt-dlp`：`python -m pip install -U yt-dlp`。
- `YTDLP_COOKIES_PATH` 可选，指向 `cookies.txt`，用于你已登录且有权访问的内容。
- `YTDLP_TIMEOUT_MS` 控制导入子进程超时，默认 120000。
- `outputDir` 如传入，必须位于 `workspace/input` 下。
- 不要用该接口批量搬运无授权素材；它是素材入库工具，不是绕过平台规则的工具。

### POST `/api/materials/analyze`

分析已导入素材或本地视频，输出 `material-analysis-*.json`。当前链路会优先读取 yt-dlp 字幕文件；当 `transcriptionMode` 为 `auto` 或 `faster-whisper` 且没有字幕时，会调用 py312 环境里的 faster-whisper 做本地 ASR。随后用 FFmpeg scene detection 生成场景变化、用 FFmpeg silencedetect 生成静音段和有声段；没有字幕/有声段/场景信号时会生成均匀分布的复核候选段。

```json
{
  "materialDir": "workspace/input/references",
  "sceneThreshold": 0.3,
  "transcriptionMode": "auto",
  "whisperModel": "tiny",
  "whisperLanguage": "zh",
  "sceneBackend": "auto",
  "autoEditorEnabled": true,
  "maxScenes": 40,
  "silenceNoiseDb": -35,
  "silenceMinDurationSec": 0.8,
  "minClipMs": 1500,
  "targetClipMs": 6000
}
```

也可以直接传：

```json
{
  "manifestPath": "workspace/input/references/demo/manifest.json"
}
```

或：

```json
{
  "videoPath": "workspace/input/simulated/sample.mp4"
}
```

返回重点字段：

```json
{
  "task": {
    "status": "completed",
    "result": {
      "transcript": { "segmentCount": 12 },
      "scenes": { "sceneCount": 8 },
      "audio": {
        "silenceCount": 4,
        "speechRangeCount": 5
      },
      "candidates": [
        { "startMs": 0, "endMs": 6000, "source": "speech" }
      ],
      "outputPath": "workspace/drafts/material-analysis-xxx.json"
    }
  }
}
```

参数说明：

- `transcriptionMode`: `auto` 字幕优先、缺字幕用 faster-whisper；`subtitle-only` 只读字幕文件；`faster-whisper` 强制本地 ASR，失败时任务失败。
- `whisperModel`: 默认 `tiny`，适合快速验证；长视频可先用 `tiny/base`，质量优先再切 `small/medium`。
- `whisperLanguage`: 可选，中文建议 `zh`；留空时由 faster-whisper 自动判断。
- `sceneBackend`: `auto` 优先 PySceneDetect、失败或无结果回退 FFmpeg；`pyscenedetect` 强制 PySceneDetect；`ffmpeg` 使用 FFmpeg scene 基线。
- `autoEditorEnabled`: 默认 true，运行 Auto-Editor preview 输出建议剪掉/保留的统计信号；不会直接修改原视频。

### POST `/api/creator/suite`

生成热点、参考拆解、脚本、素材、剪辑蓝图、发布矩阵、复盘方案。

```json
{
  "niche": "本地生活/知识口播/好物带货",
  "audience": "25-40岁想提升收入的普通人",
  "persona": "懂AI工具的实战型创作者",
  "campaignGoal": "涨粉、完播、引流、转化",
  "keywords": ["AI剪辑", "自媒体副业", "爆款视频", "抖音流量"],
  "references": ["粘贴下载的抖音/快手/B站爆款链接或标题"],
  "platforms": ["douyin", "kuaishou", "bilibili"]
}
```

### GET `/api/creator/readiness`

检查 FFmpeg、环境变量、外部工具配置位。当前会检查 DeepSeek provider key、yt-dlp、PySceneDetect、Auto-Editor、faster-whisper、npm、Python、uv、n8n 等。

### POST `/api/remotion/render`

把结构化脚本渲染成 Remotion 包装视频，输出到 `workspace/output/remotion`。当前模板会生成标题、开场钩子、分镜字幕、标签和进度条，适合先作为脚本视频包装层或后续与素材粗剪合成。可选 `bgmPath` 会在渲染后用 FFmpeg 混入本地 BGM 音频，`bgmVolume` 建议 0.12-0.25。

```json
{
  "title": "Remotion包装层实测",
  "hook": "把AI脚本变成可发布的视频包装层。",
  "aspectRatio": "9:16",
  "platform": "douyin",
  "durationSec": 15,
  "bgmPath": "workspace/input/audio/bgm.mp3",
  "bgmVolume": 0.18,
  "tags": ["AI剪辑", "Remotion"],
  "beats": [
    {
      "time": "0-3s",
      "shot": "标题卡",
      "voiceover": "先抓痛点",
      "caption": "热点不是猜，是数据判断"
    }
  ]
}
```

返回任务，前端会轮询 `/api/tasks?id=...`：

```json
{
  "task": {
    "type": "remotion-render",
    "status": "completed",
    "result": {
      "outputPath": "workspace/output/remotion/xxx-script-package.mp4",
      "compositionId": "ScriptPackageVertical",
      "bgmPath": "workspace/input/audio/bgm.mp3",
      "bgmVolume": 0.18
    }
  }
}
```

### GET `/api/workspace/assets`

扫描项目本地 `workspace`，返回最近素材、输出视频、分析 JSON、manifest、剪映计划等真实文件。UI 用它给“联网素材”和“自动剪辑”模块提供一键填路径能力。

```text
/api/workspace/assets?limit=80
```

返回重点字段：

```json
{
  "total": 64,
  "counts": {
    "video": 23,
    "manifest": 3,
    "material-analysis": 2,
    "jianying-plan": 8
  },
  "assets": [
    {
      "kind": "material-analysis",
      "role": "draft",
      "fileName": "material-analysis-xxx.json",
      "relativePath": "workspace/drafts/material-analysis-xxx.json",
      "sizeBytes": 2048
    }
  ]
}
```

## 集成和 MCP

### GET `/api/integrations`

返回成熟工具目录，包括 FFmpeg、Whisper、PySceneDetect、Auto-Editor、Remotion、OpenTimelineIO、JianYing MCP 等。

### GET `/api/mcp/config`

返回 MCP 配置建议和剪映草稿桥接说明。

## 发布队列

### GET `/api/publish/queue`

读取本地待发布队列和平台 adapter 状态。队列文件落在 `workspace/drafts/publish-queue.json`。当前所有 adapter 都是 dry-run only，不会真实上传。

### POST `/api/publish/queue`

先执行发布 dry-run，再创建待发布队列项。dry-run 通过时状态为 `ready`，失败时状态为 `blocked`。

```json
{
  "platform": "douyin",
  "videoPath": "workspace/output/publish/demo-douyin.mp4",
  "title": "3个剪映隐藏功能",
  "description": "可选简介",
  "tags": ["剪辑", "AI"]
}
```

### POST `/api/publish/approve`

人工确认闸门。只有 `ready` 队列项且确认口令为 `CONFIRM_DRY_RUN_ONLY` 时，才会进入 `approved`。这一步仍不真发，只为后续真实 adapter 接入建立安全队列。

```json
{
  "id": "publish-queue-item-id",
  "manualConfirm": "CONFIRM_DRY_RUN_ONLY",
  "note": "人工已检查标题、画幅、账号和素材权利"
}
```

### POST `/api/publish/dispatch`

消费 `approved` 队列项，生成真实 adapter 的草稿请求或命令预览。默认只预览；只有设置 `PUBLISH_LIVE_ENABLED=true`、adapter 配置完整且 `mode` 为 `draft` 时，才会调用 Postiz Public API 创建草稿，不会直接发布 `now`。

```json
{
  "id": "publish-queue-item-id",
  "mode": "draft",
  "manualConfirm": "CONFIRM_DRY_RUN_ONLY"
}
```

Postiz adapter 依据官方 Public API：`Authorization` header、`POST /public/v1/posts`、`type: "draft"`。需要配置 `POSTIZ_API_KEY`、`POSTIZ_INTEGRATION_ID_<PLATFORM>` 和可选的 `POSTIZ_PLATFORM_TYPE_<PLATFORM>`。

### GET `/api/publish/preflight`

检查发布账号联调前置条件，不会上传、不发草稿、不执行外部命令。返回 Postiz API key 是否配置、各平台 `POSTIZ_INTEGRATION_ID_*` 是否缺失、`GET /public/v1/integrations` probe 状态、social-auto-upload session/config 文件是否存在、阻塞项和下一步动作。

可选 query：
- `probePostiz=true`：在有 `POSTIZ_API_KEY` 时调用 Postiz integrations 接口验证连通性。
- `platforms=douyin&platforms=bilibili`：只检查指定平台；不传则检查抖音、快手、B站。

### POST `/api/publish/preflight`

创建 `publish-preflight` 任务并返回最终 task。请求体示例：

```json
{
  "probePostiz": true,
  "platforms": ["douyin", "kuaishou", "bilibili"]
}
```

该接口只返回配置和连通性结果，不在响应中暴露 API key。

## 数据回流

### GET `/api/analytics/import`

读取本地复盘 ledger：`workspace/drafts/analytics-ledger.json`。

### POST `/api/analytics/import`

导入一个平台数据快照，计算互动率、分享率、评论率、涨粉转化率，并生成下一步动作建议。当前支持手动/UI/脚本导入；后续接 TikHub、Postiz analytics 和平台后台。

```json
{
  "platform": "douyin",
  "postId": "post-123",
  "window": "30m",
  "metrics": {
    "views": 1200,
    "likes": 80,
    "comments": 12,
    "shares": 8,
    "favorites": 20,
    "followersDelta": 3,
    "completionRate": 0.42
  }
}
```

## n8n 编排

### GET `/api/orchestration/n8n`

返回当前 n8n webhook 是否已配置，以及可导入/参考的工作流蓝图。蓝图包含定时触发、趋势情报、脚本生成、全链路成片、发布队列、人工批准、dispatch 草稿和复盘导入节点。

### POST `/api/orchestration/n8n`

生成或触发全链路 n8n webhook。默认 `mode` 为 `dry-run`，只返回 payload 预览；只有在 `mode: "webhook"`、配置 `N8N_WEBHOOK_URL`，且 `manualConfirm` 为 `CONFIRM_N8N_WEBHOOK` 时才会 POST 到 n8n。payload 不包含 API key。传入 `exportWorkflow: true` 时，会额外生成可导入 n8n 的 workflow JSON 到 `workspace/drafts/n8n-workflow-*.json`。

```json
{
  "topic": "AI剪辑副业真的能赚钱吗",
  "platform": "douyin",
  "mode": "dry-run",
  "category": "tech",
  "topN": 20,
  "audience": "25-40岁想提升收入的普通人",
  "durationSec": 45,
  "references": ["https://example.com/reference"],
  "videoPath": "workspace/output/publish/demo-douyin.mp4",
  "analyticsWindow": "30m",
  "exportWorkflow": true
}
```

### 本机 n8n 烟测

```powershell
npm run n8n:smoke
```

该命令默认会生成一个最小 n8n workflow，导入到 `n8n` Docker 容器，然后临时停止服务容器，用同一 compose volume 启动一次性 n8n CLI 容器执行 workflow。默认 workflow 的 HTTP 节点会从容器内访问 `http://host.docker.internal:5182/api/orchestration/n8n`，执行结果写入 `workspace/drafts/n8n-smoke-status-result-*.json`。执行结束后会自动把主 `n8n` 容器重新启动。

更深一层的分阶段 smoke：

```powershell
$env:N8N_SMOKE_MODE='orchestration'
npm run n8n:smoke
Remove-Item Env:\N8N_SMOKE_MODE
```

`orchestration` 模式会让 n8n 真实执行 4 个本地节点：读取 `/api/orchestration/n8n` 蓝图、检查 `/api/creator/readiness`、扫描 `/api/workspace/assets?limit=5`、再 POST `/api/orchestration/n8n` 生成 dry-run payload。该模式不会触发 webhook、不会渲染成片、不会上传或发布。

可选环境变量：

```text
N8N_CONTAINER=n8n
N8N_SMOKE_MODE=status|orchestration
N8N_SMOKE_APP_BASE_URL=http://host.docker.internal:5182
N8N_SMOKE_N8N_BASE_URL=http://localhost:5678
```

## 诊断

### GET `/api/system/diagnostics`

返回系统诊断信息，适合判断本地 FFmpeg、工作区路径和环境变量是否正常。

## 错误处理约定

当前 route 已经使用 Zod schema。后续生产化要统一补：

- Zod 校验失败返回 HTTP 400。
- 文件不存在返回 HTTP 404 或任务失败。
- 外部 API Key 缺失返回明确配置提示。
- 发布类 API 默认 dry-run，不直接真发。
