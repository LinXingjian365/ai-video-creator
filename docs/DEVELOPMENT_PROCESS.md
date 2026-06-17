# 开发、验证与运行流程

## 工作目录

真实项目目录：

```text
A:\AI视频生成剪辑助手
```

不要基于下面这个误 resume 的空壳目录继续：

```text
C:\Users\Administrator\Documents\AI视频生成剪辑助手
```

## 环境准备

```powershell
cd A:\AI视频生成剪辑助手
npm install
```

复制环境变量模板：

```powershell
Copy-Item .env.example .env.local
```

按需填写：

```text
FIRECRAWL_API_KEY=
EXA_API_KEY=
TIKHUB_API_KEY=
BILI_COOKIE=
BILI_TIMEOUT_MS=10000
DASHSCOPE_API_KEY=
LLM_PROVIDER=deepseek
DEEPSEEK_API_KEY=
DEEPSEEK_BASE_URL=https://api.deepseek.com
DEEPSEEK_MODEL=deepseek-v4-flash
DEEPSEEK_THINKING=disabled
DEEPSEEK_REASONING_EFFORT=medium
OPENAI_API_KEY=
OPENAI_BASE_URL=https://bmapi.020212.xyz/v1
OPENAI_MODEL=gpt-5.5
ARK_API_KEY=
ARK_BASE_URL=https://ark.cn-beijing.volces.com/api/v3
ARK_MODEL=doubao-seed-1-6
GPT_GATEWAY_API_KEY=
GPT_GATEWAY_BASE_URL=https://bmapi.020212.xyz/v1
GPT_GATEWAY_MODEL=gpt-5.5
LLM_TIMEOUT_MS=45000
POSTIZ_URL=http://127.0.0.1:5000/api
POSTIZ_API_KEY=
N8N_WEBHOOK_URL=
PEXELS_API_KEY=
ELEVENLABS_API_KEY=
FAL_KEY=
SOCIAL_AUTO_UPLOAD_HOME=
JIANying_MCP_PATH=
```

## 日常开发命令

```powershell
npm run test
npm run typecheck
npm run build
npm run dev -- --hostname 127.0.0.1 --port 5182
```

访问：

```text
http://127.0.0.1:5182
```

## 每次改动后的验证顺序

1. 跑 `npm run test`。
2. 跑 `npm run typecheck`。
3. 跑 `npm run build`。
4. 启动 `npm run dev -- --hostname 127.0.0.1 --port 5182`。
5. 浏览器打开本地控制台。
6. 点击“热点趋势 -> 生成热点情报”，确认 B站真实榜单、潜力分、置信度和 AI/降级状态正常。
7. 点击“联网素材 -> 查看集成目录”，确认 API 可用。
8. 点击“自动剪辑 -> 立即模拟剪辑”，确认能生成粗剪视频。
9. 查看 `/api/tasks`，确认任务日志、进度、结果正常。

## 已完成开发记录

- 创建 Next.js App Router 项目。
- 安装并锁定 Next/React/TypeScript/Zod/FFmpeg/lucide-react。
- 建立 `workspace/input`、`workspace/output`、`workspace/drafts`。
- 实现 FFmpeg 信息、裁剪、合并、分割。
- 实现内存任务队列。
- 实现创作者全链路方案生成。
- 实现工具集成目录和就绪度检查。
- 实现自动剪辑计划、真实粗剪、模拟剪辑。
- 实现可点击的 Web 控制台。
- 实现 MCP/JianYing plan JSON 生成。
- 实现 B站真实趋势情报：公开排行榜/热门 fallback、确定性评分、可选 LLM 分析。
- 修复趋势报告执行方式：短任务在 API 请求内完成并返回最终 task，避免 Next route 后台执行挂起。
- 完成 typecheck、build、浏览器点击验证。

## 技能/能力补充记录

已安装或已存在的 Codex skills：

- `openai-docs`
- `playwright-interactive`
- `screenshot`
- `speech`
- `transcribe`

注意：新安装的 skills 需要重启 Codex 后才会自动出现在技能列表里。

## 开发规范

- 新 API 必须补 Zod schema。
- 长任务必须走 `tasks.ts`。趋势报告这类短任务可以在 API 请求内完成并返回最终 task，避免 Next route 后台执行不稳定。
- 文件路径必须走 `resolveLocalPath`。
- 输出文件必须落到 `workspace/output` 或 `workspace/drafts`。
- 外部发布必须先 dry-run。
- 涉及平台抓取和下载时，文档和 UI 都要提示版权、账号授权和平台规则。

## Git 状态

当前项目目录不是 git 仓库。建议生产化前执行：

```powershell
git init
git add .
git commit -m "Initial AI video assistant console"
```

如果要保留当前快速迭代方式，也可以先不初始化 Git，但长期不建议。
