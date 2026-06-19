# 配置 + 真实联调上手指南

> 给你的最后一份「跑通」手册:当前栈状态已实测,**99% 配置已就绪**。这份带你走完剩下的 1 步手动配置 + 真实跑一次端到端。

---

## 0. 当前栈实测状态(2026-06-20 凌晨)

跑 `npm run smoke:live`(本指南配的脚本)实测结果:

| 步骤 | 状态 | 数据点 |
|---|---|---|
| Step 0 自检 | ✅ 7/8 | TTD/n8n/Postiz/LLM/BGM/FFmpeg/yt-dlp ok;KSD unconfigured(可选) |
| Step 1 抖音热榜(免费 TTD) | ✅ 3 真话题 / 49s | "端午节一桌封神挑战" 等;DeepSeek 解读病毒逻辑 ✓ |
| Step 2 脚本生成(DeepSeek) | ✅ 11s | 真 hook + 6 beats + 8 tags |
| Step 3 Postiz 探活 | ⚠️ 1 blocker | API key 有效,integrations=0 |

**唯一阻塞**:`POSTIZ_INTEGRATION_ID_*` 未填(必须你在 Postiz UI 里 OAuth 连号后才有)。

---

## 1. 唯一必做的手动配置:Postiz 连平台

不能代办的就这一项。三步:

1. 打开 http://localhost:5000(账号 `linyuxin5211314@gmail.com` / 密码 `Postiz#2026Local`)
2. 进 Settings → Channels(或"Add channel") → 分别连接 **抖音 / 快手 / B站**(用 OAuth 走完平台授权)
   - 抖音 TikTok 报 `client_key` 错:见 [3. 排查表](#3-排查表)
3. 连接成功后,每个平台会有一个 `integration_id`(在 Settings → Integrations 或 API endpoint `/api/public/v1/integrations` 可查),把三个 id 填进 `.env.local`:
   ```
   POSTIZ_INTEGRATION_ID_DOUYIN=<拿到的 id>
   POSTIZ_INTEGRATION_ID_KUAISHOU=<拿到的 id>
   POSTIZ_INTEGRATION_ID_BILIBILI=<拿到的 id>
   ```
4. 重启 dev server(让 Next 读新 env):`npm run dev`
5. 再跑 `npm run smoke:live`,blockers 应为 0。

---

## 2. 一键真实联调

`npm run smoke:live`(本指南配的脚本,默认打 `http://127.0.0.1:5182`)

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
| 发布草稿(Postiz) | `/api/publish/dispatch` | ⏳ 等 integration_id |
| n8n 编排 | webhook `ai-video-full-chain` | ✅(已导入 workflow) |
| 全链路自检 | `/api/health/self-check` + 辅助面板 | ✅ |

---

走完上面 1 节那 3 步,栈就完整可用。其他都已实测就绪。
