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
DASHSCOPE_API_KEY=
OPENAI_API_KEY=
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
npm run typecheck
npm run build
npm run dev -- -p 5177
```

访问：

```text
http://127.0.0.1:5177
```

## 每次改动后的验证顺序

1. 跑 `npm run typecheck`。
2. 跑 `npm run build`。
3. 启动 `npm run dev -- -p 5177`。
4. 浏览器打开本地控制台。
5. 点击“联网素材 -> 查看集成目录”，确认 API 可用。
6. 点击“自动剪辑 -> 立即模拟剪辑”，确认能生成粗剪视频。
7. 查看 `/api/tasks`，确认任务日志、进度、结果正常。

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
- 长任务必须走 `tasks.ts`，不要让 UI 等同步请求。
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
