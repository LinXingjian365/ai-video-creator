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

抓取 B站真实榜单，计算潜力分和置信度，并在 LLM 可用时生成爆火逻辑分析。该接口会创建 `trend-report` task，并在当前请求内完成后返回最终 task。

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

把结构化脚本渲染成 Remotion 包装视频，输出到 `workspace/output/remotion`。当前模板会生成标题、开场钩子、分镜字幕、标签和进度条，适合先作为脚本视频包装层或后续与素材粗剪合成。

```json
{
  "title": "Remotion包装层实测",
  "hook": "把AI脚本变成可发布的视频包装层。",
  "aspectRatio": "9:16",
  "platform": "douyin",
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
      "compositionId": "ScriptPackageVertical"
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

## 诊断

### GET `/api/system/diagnostics`

返回系统诊断信息，适合判断本地 FFmpeg、工作区路径和环境变量是否正常。

## 错误处理约定

当前 route 已经使用 Zod schema。后续生产化要统一补：

- Zod 校验失败返回 HTTP 400。
- 文件不存在返回 HTTP 404 或任务失败。
- 外部 API Key 缺失返回明确配置提示。
- 发布类 API 默认 dry-run，不直接真发。
