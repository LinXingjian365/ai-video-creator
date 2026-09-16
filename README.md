# AI 视频增长控制台 · AI Video Creator

> 本地 AI 视频创作全链路控制台：热点抓取 → 网页取证 → LLM 脚本 → TTS 配音 → Remotion 成片 → 多平台变体 → 发布队列 → 数据回流。

一句话概括设计原则：**真实数据进来，AI 只做推理和执行建议；素材、剪辑、发布全部经过本地文件、任务日志和人工闸门验证。**

- 技术栈：Next.js 15 App Router(全 TypeScript) + React 19 + Remotion 4 + ffmpeg + vitest
- 形态：单页「AI 视频任务指挥舱」(Operations Bay)，40+ API 路由
- 完整文档：[HANDOFF.md](./HANDOFF.md)（含架构、外部依赖、踩坑记录）

## 快速开始

```bash
cd "A:/AI视频生成剪辑助手"
cp .env.example .env.local   # 填入需要的 Key，见下方表格
npm install
npm run dev                  # 打开 http://127.0.0.1:3000
```

其它常用命令：

| 命令 | 作用 |
|---|---|
| `npm test` | vitest 全量单测（235 项） |
| `npm run typecheck` | TypeScript 全量类型检查 |
| `npm run lint` | ESLint，零警告策略 |
| `npm run build` | 生产构建（构建前建议先停 dev 并清理 `.next`） |

## 七阶段生产轨道

| # | 阶段 | 说明 |
|---|---|---|
| 01 | 热点趋势 | B站真实榜单 / 抖音(TTD 免费路径或 TikHub) / 快手 / YouTube(Data API v3) |
| 02 | 爆款拆解 | 方法 → decision JSON |
| 03 | 联网素材 | 导入 · ASR · 场景信号 |
| 04 | 文案脚本 | 钩子 · 分镜 · 字幕，带网页证据引用 |
| 05 | 自动剪辑 | FFmpeg 裁剪合并 · 剪映草稿生成 |
| 06 | 发布矩阵 | 多平台包 · preflight 体检 · dry-run |
| 07 | 运营复盘 | 命令 · Key · 网关体检 |

## 环境变量

复制 `.env.example` 为 `.env.local` 后按需填写。核心几项：

| 变量 | 用途 | 缺失时的行为 |
|---|---|---|
| `DEEPSEEK_API_KEY` | LLM 脚本生成（默认 provider） | 热点/榜单仍可用，AI 分析降级为「无 Key 不伪装 AI」 |
| `TIKHUB_API_KEY` | 抖音/快手第三方数据 | 抖音可切 TTD 免费路径，快手不可用 |
| `YOUTUBE_API_KEY` | YouTube Data API v3 | YouTube 热点不可用（已下线免登录 Trending） |
| `POSTIZ_API_KEY` / `POSTIZ_URL` | 发布网关 | 发布 preflight 报 unconfigured |
| `TTD_ENABLED` / `TTD_BASE_URL` | TikTokDownloader 自托管免费路径 | 抖音热榜走 TikHub |

> **诚实降级**：任何外部 Key 缺失都不会让界面报错或伪造数据，而是在对应面板明确标注状态。`/api/health/self-check` 会一次性探 TTD / n8n / Postiz / KSD / LLM / BGM / FFmpeg / yt-dlp 的真实可用情况。

## 可选外部服务

不启动不影响 `npm test`、`npm run build` 与本地浏览，只在需要真实数据/自动发布时才用：

| 服务 | 端口 | 启动方式 |
|---|---|---|
| TikTokDownloader | 5555 | Python venv 运行 `run_api.py` |
| n8n | 5678 | `docker compose -f deployments/n8n/docker-compose.yml up -d` |
| Postiz | 5000 | `docker compose -f deployments/postiz/docker-compose.yml up -d` |

## 测试与质量

| 项 | 状态 |
|---|---|
| vitest | 235 passed / 39 files |
| typecheck | 通过 |
| lint | 通过（零警告） |
| production build | 通过 |

测试覆盖 BGM 选曲、音频混音、Remotion 渲染参数、字幕时间轴、发布 dry-run、全链路编排、分析台账等核心链路。

## 已知的边界

- **快手热榜**：目前没有可用的免费源（TikHub 快手热榜计费、KS-Downloader 无热榜端点），保留 TikHub 路径，不伪造数据。
- **B站 API**：真实榜单可用，但 `code=-352` 风控会间歇触发，重试或换分区通常恢复。
- **剪映**：新版加密草稿，改用 `pyJianYingDraft` 从零生成明文草稿绕过。
  ⚠️ **必须锁定 `pyJianYingDraft==0.2.6`**（见 `scripts/requirements.txt`）：脚本调用的是
  `ScriptFile.add_track(track_type, track_name)`，该 API 在 0.3.0 已被移除
  （改为 `append_track(TrackSpec)`，签名完全不同），裸 `pip install` 会装到 0.3.0 并运行时报错。

## License

MIT — 详见 [LICENSE](./LICENSE)。
