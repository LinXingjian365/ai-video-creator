# API 与本地调用说明

本项目 API 都运行在 Next.js App Router 下。开发服务器默认示例：

```text
http://127.0.0.1:5177
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

按 clips 或 planPath 执行真实粗剪。

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
Invoke-RestMethod -Method Post -Uri "http://127.0.0.1:5177/api/auto/simulate" -ContentType "application/json" -Body $body
```

## 创作者全链路

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

检查 FFmpeg、环境变量、外部工具配置位。

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
