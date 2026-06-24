# 配置 + 真实联调上手指南

> 给你的最后一份「跑通」手册:当前栈状态已实测,**99% 配置已就绪**。这份带你走完剩下的 1 步手动配置 + 真实跑一次端到端。

---

## 0. 当前栈实测状态(2026-06-20 凌晨)

### 快速 smoke(`npm run smoke:live`,~70s)

| 步骤 | 状态 | 数据点 |
|---|---|---|
| Step 0 自检 | ✅ 7/8 | TTD/n8n/Postiz/LLM/BGM/FFmpeg/yt-dlp ok;KSD unconfigured(可选) |
| Step 1 抖音热榜(免费 TTD) | ✅ 3 真话题 / 49s | "端午节一桌封神挑战" 等;DeepSeek 解读病毒逻辑 ✓ |
| Step 2 脚本生成(DeepSeek) | ✅ 11s | 真 hook + 6 beats + 8 tags |
| Step 3 Postiz 探活 | ⚠️ 1 blocker | API key 有效,配置中心可读取 integrations;当前 integrations=0 |

### 完整含渲染 smoke(`npm run smoke:live:full`,~7 分钟)— **已实证全链路出真视频**

| 阶段 | 实测产物 |
|---|---|
| ① 文案脚本(LLM) | 标题 "别再这样吃了!3个健康饮食的真相颠覆你的认知" + hook + beats |
| ② Remotion 成片 | `workspace/output/remotion/1781887273412-script-package.mp4`(3.3 MB) |
| ③ 多平台变体 | 4 个真实 mp4: 抖音 1080×1920 / 快手 1080×1920 / B站 1920×1080 / 方形 1080×1080 |
| 总耗时 | **433 秒**(LLM ~15s + 渲染 ~100s + 4 变体 ffmpeg ~25s,其余 bundle) |
| 单变体 ffprobe | h264 真编码 / aac 音频 / 时长 45.0s / 文件 1.1–2.0 MB |

→ **栈真的能产出可上传到抖音/快手/B站的成片**,不是空架子。

**唯一阻塞**:`POSTIZ_INTEGRATION_ID_*` 未填(必须你在 Postiz UI 里 OAuth 连号后才有)。

---

## 1. 唯一必做的手动配置:Postiz 连平台

### 先用页面配置中心补齐其余项目

打开 [http://127.0.0.1:5182](http://127.0.0.1:5182)，进入「辅助工具 → 全链路自检 → 本机配置中心」。页面按四组管理 AI 模型、热点/联网证据、编排/发布、本地媒体工具：

- 敏感字段只显示“已配置/未配置”，永不回显原值。
- 保存只写入白名单变量，并要求本机同源请求与显式确认。
- 「实测当前模型」会真实调用一次当前 LLM；普通自检不调用模型，避免无意计费。
- 「读取 Postiz 渠道」会调用本地 Postiz `/public/v1/integrations`，列出已连接渠道与候选 `integration_id`，可一键填回表单后再保存。
- 「运行真实链路」会创建真实 `/api/full-chain` 后台任务，生成 MP4 与多平台变体，但不会自动发布。

2026-06-20 最新实测：配置中心成功写入 `APP_BASE_URL=http://127.0.0.1:5182` 和安全默认 `PUBLISH_LIVE_ENABLED=false`；DeepSeek 最小生成探针成功；Postiz integrations 探针返回 API 可用但渠道列表为空，说明仍需先在 Postiz UI 完成平台 OAuth。

不能代办的就这一项。三步:

1. 打开 http://localhost:5000(账号 `linyuxin5211314@gmail.com` / 密码 `Postiz#2026Local`)
2. 进 Settings → Channels(或"Add channel") → 分别连接 **抖音 / 快手 / B站**(用 OAuth 走完平台授权)
   - 抖音 TikTok 报 `client_key` 错:见 [3. 排查表](#3-排查表)
3. 连接成功后,回到本项目配置中心的「编排与发布」→ 点「读取 Postiz 渠道」：
   - 如果系统能识别平台候选，点对应的「填入 id」按钮，再点「保存当前分组」。
   - 如果平台识别为未知，就把列表里对应账号的 id 手动填进下面三个字段。
   ```
   POSTIZ_INTEGRATION_ID_DOUYIN=<拿到的 id>
   POSTIZ_INTEGRATION_ID_KUAISHOU=<拿到的 id>
   POSTIZ_INTEGRATION_ID_BILIBILI=<拿到的 id>
   ```
4. 如果你直接改 `.env.local` 而不是通过配置中心保存，重启 dev server(让 Next 读新 env):`npm run dev`
5. 再跑 `npm run smoke:live`,blockers 应为 0。

---

## 2. 一键真实联调

两种粒度:

- **快速(诊断/日常)** `npm run smoke:live` ~70s:trend → script → preflight,不渲染
- **完整(实证产视频)** `npm run smoke:live:full` ~7 分钟:含 Remotion 渲染 + 4 平台变体,完成后看 `workspace/output/publish/<topic>-<ts>/*.mp4`

> 前提:dev server 在 5182 端口,TTD 在 5555,Docker 6 容器全 Up。任一项缺,自检会指出来。
> 启动顺序:Docker Desktop → `docker compose -f deployments/postiz/docker-compose.yml up -d` + `docker compose -f deployments/n8n/docker-compose.yml up -d` → `cd ~/Desktop/TikTokDownloader && .venv/Scripts/python.exe run_api.py` → `npm run dev`

实拉一条完整链路(渲染省略,避免 LLM 重复消耗;UI 主界面有完整一键全链路):

```bash
# 趋势 → 脚本 → 草稿预览(不真发,需 PUBLISH_LIVE_ENABLED=true + 已 approve 队列项)
curl -s -X POST http://127.0.0.1:5182/api/trend/report \
  -H "Content-Type: application/json" \
  -d '{"platform":"douyin","category":"hot","topN":3}'

curl -s -X POST http://127.0.0.1:5182/api/script/generate \
  -H "Content-Type: application/json" \
  -d '{"topic":"端午节一桌封神挑战","platform":"douyin","durationSec":30}'

# 端到端含渲染走 UI 的"一键全链路"按钮(避免一次跑挂 token)
```

---

## 3. 排查表

| 现象 | 原因 | 解法 |
|---|---|---|
| `npm run smoke:live` Step 0 报 `down` | 服务下线 | 看 hint 跑对应启动命令(自检面板里也有) |
| TTD 5555 不通 | 进程没自启 | `cd ~/Desktop/TikTokDownloader && .venv/Scripts/python.exe run_api.py` |
| Docker 容器没跑 | DD 退出了 | 打开 Docker Desktop(可去 Settings → General → AutoStart 设开机自启);然后 `docker compose -f deployments/{n8n,postiz}/docker-compose.yml up -d` |
| Postiz 连 TikTok 报 `client_key` 错 | Postiz 自己的 TikTok OAuth 缺开发者凭证 | Postiz UI → Settings → Providers → TikTok 填 client_key/secret(去 developers.tiktok.com 注册一个 app);**抖音(douyin)是不同平台,无此问题** |
| `/api/trend/report` 抖音返回空 | TTD 在跑但 cookie 风控 | `.env.local` 配 `TTD_DOUYIN_COOKIE`(从浏览器抖音站抓);热榜通常无需 |
| DeepSeek 慢/失败 | 网络抖动 | `.env.local` 切 `LLM_PROVIDER=openai` 用网关备用 |
| KSD unconfigured | 快手详情没接 KS-Downloader | 可选;不配则走 TikHub 计费接口 |
| 全链路自检在 UI 里看 | 主界面"辅助 → 全链路自检" | 自动跑,显示四态 + 修复 hint |

---

## 4. 真正的发布(把闸门打开)

`npm run smoke:live` 默认走 dry-run(只产预览不真发,Postiz `liveEnabled=false`)。真要发草稿:

1. `.env.local` 设 `PUBLISH_LIVE_ENABLED=true`
2. 经 `/api/publish/queue` 入队 → 经 `/api/publish/approve` 人工批准(口令 `CONFIRM_DRY_RUN_ONLY`)
3. `/api/publish/dispatch` 才会真打 Postiz `POST /public/v1/posts` 创建 `type: "draft"`(**永远是 draft,不真发,人工去 Postiz 后台点发布**)

这套闸门是项目「绝不静默上传」原则,不要绕过。

---

## 5. 完整能力对照(实测能跑通的)

| 能力 | 路径 | 实测 |
|---|---|---|
| 抖音热榜(免费) | TTD `/douyin/hot` | ✅ |
| 快手热榜 | TikHub(付费,有余额) | ✅ |
| B站榜单 | 官方公开 | ✅(`code=-352` 偶发,重试可) |
| YouTube | Data API v3(需 `YOUTUBE_API_KEY`) | ⏳ 待配 |
| 脚本生成(DeepSeek/带证据) | `/api/script/generate` | ✅ |
| 网页事实证据 | Exa/Firecrawl(需 key) | ⏳ 待配 |
| AI 配音 | edge-tts / SAPI | ✅ |
| Remotion 成片 + 字幕 + BGM | `/api/full-chain` | ✅ |
| 自动选曲 | `workspace/input/audio/` 8 首 CC-BY | ✅ |
| 多平台变体 | `/api/video/variants` | ✅ |
| 发布草稿(Postiz) | `/api/publish/dispatch` | ⏳ 等平台 OAuth 后的 integration_id |
| n8n 编排 | webhook `ai-video-full-chain` | ✅(已导入 workflow) |
| 全链路自检 | `/api/health/self-check` + 辅助面板 | ✅ |
| 本机配置中心 | `/api/config/local` + `/api/config/probe` + `/api/config/postiz` | ✅(密钥不回显，DeepSeek 与 Postiz 探针实测通过) |

---

走完上面 1 节那 3 步,栈就完整可用。其他都已实测就绪。
