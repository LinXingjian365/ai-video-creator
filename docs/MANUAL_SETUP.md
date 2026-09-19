# 人工配置清单

> 能自动装的部分已经做完了（Python 工具链、TikTokDownloader、n8n）。
> 剩下这几项**必须你本人操作**——涉及打开 Docker、在第三方平台做 OAuth 授权、申请 API Key。
> 按下面的顺序走，每步都有验证方法。

---

## 第 0 步：打开 Docker Desktop（前置）

n8n 和 Postiz 都跑在 Docker 里。**自检里这两项报红，八成是它没开。**

```powershell
docker version          # 能看到 Server 版本才算正常
```

- 看不到 Server 版本 → 打开 Docker Desktop，等托盘图标不再转圈。
- 建议：Docker Desktop → Settings → General → 勾 **Start Docker Desktop when you log in**，
  省得每次开机都要手动开。
- 报 `dockerDesktopLinuxEngine` 不存在 = daemon 没起来，不是配置错，开了就行。

然后起两个栈：

```powershell
cd "A:\AI视频生成剪辑助手"
docker compose -f deployments/n8n/docker-compose.yml up -d
docker compose -f deployments/postiz/docker-compose.yml up -d
docker ps               # 应该能看到 n8n / postiz / temporal / postgres / redis / elasticsearch
```

验证：`curl http://127.0.0.1:5678/healthz` 应返回 `{"status":"ok"}`。

---

## 第 1 步：Postiz 连平台拿渠道 ID（唯一无法代办的一步）

Postiz 是发布网关。它的 API 必须先由你在它的界面里完成 OAuth 授权，才会有渠道 ID。

1. 浏览器打开 **http://localhost:5000**
2. **注册账号**（首个注册的账号自动成为 admin）
   - 注册完建议把 `deployments/postiz/docker-compose.yml` 里 `DISABLE_REGISTRATION` 改成 `"true"`
     再 `docker compose ... up -d` 重启，避免后续被外人注册。
   - ⚠️ 用你自己注册的账号，不要用任何文档里出现过的示例凭据。
3. 进 **Settings → Channels（或 Add channel）**，分别连接：
   - **抖音**（douyin）
   - **快手**（kuaishou）
   - **B站**（bilibili）
4. 连完后回到项目，一条命令自动回填：

```powershell
npm run postiz:channels            # 先看看识别到哪些渠道
npm run postiz:channels -- --write # 确认无误后写回 .env.local
```

脚本会调用本地 Postiz `/public/v1/integrations`，按平台关键词匹配，
写入 `POSTIZ_INTEGRATION_ID_DOUYIN` / `_KUAISHOU` / `_BILIBILI`。
若某个平台识别成 unknown，脚本会列出全部渠道 id，手动填这三个字段即可。

5. 改完 `.env.local` **重启 dev server**（Next 才会读新 env），再跑 `npm run smoke:live`，
   blockers 应为 0。

> 抖音 = douyin，和 TikTok 是不同平台。连 TikTok 报 `client_key` 错是 Postiz 自己的
> TikTok OAuth 缺开发者凭证（要去 developers.tiktok.com 注册 app），**抖音不受影响**。

---

## 第 2 步：启动 TikTokDownloader（抖音免费热榜）

已经在 `C:\Users\Administrator\Desktop\TikTokDownloader` 装好了，你只需要把它跑起来：

```powershell
cd "A:\AI视频生成剪辑助手"
npm run ttd:start
```

脚本会自动定位目录、已在跑则不重复起、起来后探活。

- 它是**手动起的 Python 服务，不自启**，重启电脑后要再跑一次。
- 没跑也不致命：抖音热榜会自动回退到 TikHub（已有 Key），不会让链路挂掉。
- 首次安装/换机器见 [`patches/README.md`](../patches/README.md)。

验证：`curl -X POST http://127.0.0.1:5555/douyin/hot -H "Content-Type: application/json" -d "{}"`
应返回 4 个榜单。

---

## 第 3 步：可选 Key（按需，不配不影响核心链路）

| 变量 | 用途 | 缺失时 |
|---|---|---|
| `YOUTUBE_API_KEY` | YouTube Data API v3 热点 | YouTube 热点不可用（免登录 Trending 已下线） |
| `EXA_API_KEY` / `FIRECRAWL_API_KEY` | 网页事实证据抓取 | 证据环节降级，脚本仍可生成 |
| `BILI_COOKIE` | B站风控（`-352`）时提权 | 偶发风控，重试或换分区通常恢复 |
| `JIANYING_DRAFTS_DIR` | 剪映草稿输出目录 | 默认 `D:/JianyingPro Drafts`，按你本机剪映改 |
| `YTDLP_COOKIES_PATH` | yt-dlp 导入需登录内容 | 公开素材不受影响 |

改这些走页面更安全：指挥舱 → **辅助 → 本机配置中心**（敏感字段只显示"已配置/未配置"，不回显）。

---

## 第 4 步：验证

```powershell
npm run dev            # 或已在跑就跳过
npm run smoke:live     # ~70s：趋势 → 脚本 → preflight，不渲染
```

想看 UI 状态：指挥舱 → **辅助 → 全链路自检**，一眼看 TTD / n8n / Postiz / KSD / LLM / BGM / FFmpeg / yt-dlp 的真实状态。

想实证出片：`npm run smoke:live:full`（~7 分钟，含 Remotion 渲染 + 4 平台变体）。

---

## 常见红灯速查

| 现象 | 原因 | 解法 |
|---|---|---|
| n8n / Postiz 全红 | Docker Desktop 没开 | 第 0 步 |
| TTD 5555 不通 | 手动服务没起 | 第 2 步 `npm run ttd:start` |
| Postiz 报 `client_key` | 连的是 TikTok 不是抖音 | 第 1 步注释，连抖音 |
| 发布 dispatch 报 unconfigured | `POSTIZ_INTEGRATION_ID_*` 没填 | 第 1 步第 4 小步 |
| 抖音热榜空 | TTD 在跑但被风控 | `.env.local` 配 `TTD_DOUYIN_COOKIE`（公开热榜通常不需要） |

完整排查表见 [`CONFIG_AND_LAUNCH.md`](./CONFIG_AND_LAUNCH.md#3-排查表)。
