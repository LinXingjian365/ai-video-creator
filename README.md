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
npm run tools:setup          # 建本地 Python 工具链（.venv-tools）
npm run dev                  # 打开 http://127.0.0.1:3000
```

其它常用命令：

| 命令 | 作用 |
|---|---|
| `npm test` | vitest 全量单测 |
| `npm run typecheck` | TypeScript 全量类型检查 |
| `npm run lint` | ESLint，零警告策略 |
| `npm run build` | 生产构建（构建前建议先停 dev 并清理 `.next`） |
| `npm run tools:setup` | 建 `.venv-tools` 并装 yt-dlp / PySceneDetect / Auto-Editor |
| `npm run tools:setup -- --with-asr` | 额外装 faster-whisper（本地 ASR，包体较大） |
| `npm run tools:setup -- --with-jianying` | 额外装 `scripts/requirements.txt`（剪映草稿） |
| `npm run postiz:channels` | 识别 Postiz 已连接渠道 |
| `npm run ttd:start` | 启动 TikTokDownloader（抖音免费热榜，5555） |
| `npm run smoke:live` | 对运行中的 dev server 跑真实链路冒烟 |

### Python 工具链

应用只以 `python -m <module>` 方式调用 yt-dlp / PySceneDetect / Auto-Editor /
faster-whisper，因此解释器解析顺序是：

1. `VIDEO_TOOLS_PYTHON`（或 `JIANYING_PYTHON`）环境变量——显式指定，不再探测；
2. 项目内 `.venv-tools`（`npm run tools:setup` 生成）；
3. 系统 `py` / `python3` / `python`。

> 候选解释器是**实际启动 `--version` 探测**出来的，不是只看文件存在。
> Windows 上 PATH 里的 `python` 常是 `C:\Windows\System32` 下的 Microsoft Store
> 存根——文件存在但无法执行，这类解释器会被自动跳过。

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
| `TTD_ENABLED` / `TTD_BASE_URL` | TikTokDownloader 自托管免费路径 | 抖音热榜改走 TikHub |
| `VIDEO_TOOLS_PYTHON` | Python 工具链解释器 | 自动探测，见上文「Python 工具链」 |
| `POSTIZ_API_KEY` / `POSTIZ_URL` | **海外平台**发布网关（可选） | 不影响国内平台，海外平台才需要 |
| `SOCIAL_AUTO_UPLOAD_DIR` / `_ACCOUNT_*` | 国内平台自动化发布 | 不配则国内平台走手动发布 |

> **国内平台自动化发布（抖音/快手/B站）**：走 [`social-auto-upload`](https://github.com/dreammis/social-auto-upload)
> （11K★ 开源），用**浏览器自动化**操作各平台创作者后台。国内平台都没有面向个人的开放上传 API
> （要企业资质），这是唯一技术路径。
>
> > ### ⚠️ 风险提示（启用前请读）
> > 平台风控能识别浏览器自动化，可能判定为异常行为并**限制或封禁账号**——
> > 这是此类工具的已知风险（见 social-auto-upload 官方 FAQ）。
> >
> > **默认建议走「手动发布」**：项目已按各平台规格生成成片、标题、简介、标签、封面，
> > 人工到平台后台上传只差最后一下，**无此风险**。
> > 只有在明确接受风险时才启用自动化（`SOCIAL_AUTO_UPLOAD_EXECUTE=true`）。
>
> 安装与登录见 [`docs/MANUAL_SETUP.md`](./docs/MANUAL_SETUP.md)。
>
> **绝不静默上传**：默认只生成可执行命令、不真发。真正执行需三重闸门全开——
> `SOCIAL_AUTO_UPLOAD_EXECUTE=true` + `PUBLISH_LIVE_ENABLED=true` + `mode=live`。
>
> **海外平台（可选）**：走 Postiz（`docker compose -f deployments/postiz/docker-compose.yml up -d`
> 后 `npm run postiz:channels`）。⚠️ Postiz 只支持海外平台，**不支持抖音/快手/B站**。

> **诚实降级**：任何外部 Key 缺失都不会让界面报错或伪造数据，而是在对应面板明确标注状态。`/api/health/self-check` 会一次性探 TTD / n8n / Postiz / KSD / LLM / BGM / FFmpeg / yt-dlp 的真实可用情况。

## 可选外部服务

不启动不影响 `npm test`、`npm run build` 与本地浏览，只在需要真实数据/自动发布时才用：

| 服务 | 端口 | 启动方式 |
|---|---|---|
| n8n | 5678 | `docker compose -f deployments/n8n/docker-compose.yml up -d` |
| TikTokDownloader | 5555 | 首次安装见 [patches/README.md](./patches/README.md)；之后 `.venv\Scripts\python.exe run_api.py` |
| Postiz | 5000 | `docker compose -f deployments/postiz/docker-compose.yml up -d` |

> n8n 与 Postiz 都走 Docker，所以**自检报红时先确认 Docker Desktop 是否开着**
> （`docker version` 能返回 Server 版本才算正常）。TikTokDownloader 是手动起的 Python
> 服务，不自启——它没跑时抖音热榜会自动回退到 TikHub（已有 Key 时），不会让链路挂掉。

> n8n 只通过 HTTP webhook 集成，项目不调用 `n8n` 命令行。环境体检因此探测
> `N8N_WEBHOOK_URL` 指向地址的 `/healthz`，而不是本地 CLI——容器化部署下本地没有 CLI，
> 探测 CLI 会永远误报不可用。

## 测试与质量

| 项 | 状态 |
|---|---|
| vitest | 262 passed / 42 files |
| typecheck | 通过 |
| lint | 通过（零警告） |
| production build | 通过 |

测试覆盖 BGM 选曲、音频混音、Remotion 渲染参数、字幕时间轴、发布 dry-run、全链路编排、分析台账等核心链路。

## 已知的边界

- **国内平台自动发布（抖音/快手/B站）**：走 `social-auto-upload`（浏览器自动化）。
  ⚠️ **有风控风险**：平台可能识别自动化特征并限制/封禁账号（此类工具的已知风险）。
  **建议默认走手动发布**，自动化仅在明确接受风险时启用。详见下方「发布」章节。
  真正执行上传需三重闸门全开，默认只给命令预览——这是「绝不静默上传」原则。
- **快手热榜**：目前没有可用的免费源（TikHub 快手热榜计费、KS-Downloader 无热榜端点），保留 TikHub 路径，不伪造数据。
- **抖音热榜免费路径**：依赖自托管的 TikTokDownloader，需单独安装且**手动启动**（不随系统/项目自启）。
  没跑时会自动回退到 TikHub（已有 Key），不会让链路挂掉。安装见 `patches/README.md`，启动用 `npm run ttd:start`。
- **B站 API**：真实榜单可用，但 `code=-352` 风控会间歇触发，重试或换分区通常恢复。
- **剪映**：新版加密草稿，改用 `pyJianYingDraft` 从零生成明文草稿绕过。
  ⚠️ **必须锁定 `pyJianYingDraft==0.2.6`**（见 `scripts/requirements.txt`）：脚本调用的是
  `ScriptFile.add_track(track_type, track_name)`，该 API 在 0.3.0 已被移除
  （改为 `append_track(TrackSpec)`，签名完全不同），裸 `pip install` 会装到 0.3.0 并运行时报错。

## License

MIT — 详见 [LICENSE](./LICENSE)。
