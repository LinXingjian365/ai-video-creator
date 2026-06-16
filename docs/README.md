# AI 视频生成剪辑助手文档总览

本项目目标不是做一个只有表单的壳，而是做一个本地 Web 控制台，把“选题 -> 素材 -> 拆解 -> 脚本 -> 自动剪辑 -> 剪映草稿 -> 发布矩阵 -> 复盘”串成可执行的 AI 视频生产流水线。

当前状态要分清楚：

- 已完成：本地 Next.js 控制台、FFmpeg 核心视频处理、任务队列、自动模拟剪辑、粗剪输出、剪映草稿计划 JSON、工具集成目录、环境配置检查、类型检查和构建验证。
- 已规划并留好接入位：热点采集、素材下载、ASR 转写、场景检测、静音快剪、Remotion 图文包装、n8n 编排、Postiz/平台发布、数据复盘。
- 尚未全部真实接通：外部账号、API Key、平台登录态、Python 工具安装、真实抖音/快手/B站发布和真实数据回流。这些必须在本机凭据和账号准备好后逐项接入。

## 文档地图

- [全链路成熟工具链选型](./FULL_CHAIN_TOOLCHAIN.md)
- [系统架构与数据流](./ARCHITECTURE.md)
- [API 与本地调用说明](./API.md)
- [开发、验证与运行流程](./DEVELOPMENT_PROCESS.md)
- [生产化路线图](./ROADMAP.md)

## 快速运行

```powershell
cd A:\AI视频生成剪辑助手
npm install
npm run typecheck
npm run build
npm run dev -- -p 5177
```

本地访问：

```text
http://127.0.0.1:5177
```

## 最近一次验证结果

已经通过：

- `npm run typecheck`
- `npm run build`
- 浏览器打开 `http://127.0.0.1:5177`
- UI 点击“联网素材 -> 查看集成目录”
- UI 点击“自动剪辑 -> 立即模拟剪辑”

最近一次 UI 模拟剪辑生成：

```text
A:\AI视频生成剪辑助手\workspace\output\simulate-1781593851830-rough-cut.mp4
A:\AI视频生成剪辑助手\workspace\drafts\simulate-1781593851830-decision.json
A:\AI视频生成剪辑助手\workspace\drafts\一键模拟自动剪辑-1781593860419-jianying-plan.json
```

## 项目边界

本项目优先本地运行，默认不上传用户素材。涉及抓取、下载、平台发布、账号登录态和第三方 API 的能力，需要用户自己提供合法来源、账号授权和 API Key，并遵守对应平台规则。
