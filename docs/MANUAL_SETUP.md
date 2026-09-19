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

## 第 1 步：发布方式

国内平台（抖音/快手/B站）有两条路，**二选一**：

### A. 自动发布（有风控风险，请先读警告）— social-auto-upload

> ## ⚠️ 先读这段：风控风险
>
> 平台风控能识别浏览器自动化，可能判定为异常行为并**限制或封禁账号**——
> 这是此类工具的已知风险（见 social-auto-upload 官方 FAQ）。
>
> - **默认建议走 B 方案（手动发布）**：无此风险，且项目已把成片、标题、简介、标签、封面
>   全部按平台规格准备好，你只需上传那最后一下。
> - 只有在**明确接受风险**时才启用 A 方案。
> - `SOCIAL_AUTO_UPLOAD_EXECUTE` 默认 `false`，别轻易打开。

**已经装好了**：`A:\social-auto-upload`（含 venv、全部依赖、playwright + patchright 浏览器）。

原理是**浏览器自动化**：直接操作各平台的创作者后台，等价于「人工上传」的自动化。
国内平台都没有面向个人的开放上传 API（要企业资质），这是唯一技术路径——但**代价是风控风险**。

**你只需扫码登录一次**：

```powershell
npm run sau:login -- -Platform douyin   -Account my_douyin
npm run sau:login -- -Platform kuaishou -Account my_ks
npm run sau:login -- -Platform bilibili -Account my_bili
```

- 会弹出浏览器窗口，用对应 App 扫码即可
- 登录态存到 `A:\social-auto-upload\cookies\`，之后不用重复登录
- 账号名（`my_douyin` 这些）随便起，是本地标识，用来区分多个账号
- 验证是否还有效：加 `-Check`，如 `npm run sau:login -- -Platform douyin -Account my_douyin -Check`

登录完在 `.env.local` 里配：

```ini
SOCIAL_AUTO_UPLOAD_DIR=A:\social-auto-upload
SOCIAL_AUTO_UPLOAD_ACCOUNT_DOUYIN=my_douyin
SOCIAL_AUTO_UPLOAD_ACCOUNT_KUAISHOU=my_ks
SOCIAL_AUTO_UPLOAD_ACCOUNT_BILIBILI=my_bili
SOCIAL_AUTO_UPLOAD_BILIBILI_TID=249
```

> ⚠️ **默认只生成命令预览，不会真发**。要真正执行上传，需**三重闸门全开**：
> 1. `SOCIAL_AUTO_UPLOAD_EXECUTE=true`
> 2. `PUBLISH_LIVE_ENABLED=true`
> 3. 调用 `/api/publish/dispatch` 时传 `mode=live`
>
> 这是项目的「绝不静默上传」原则——任何一个没开，你拿到的都是可复制的命令而不是已发出去的作品。

### B. 手动发布（推荐，零风险）

项目已把发布需要的一切按平台规格准备好，你只需上传：

1. **出片**：跑 `npm run smoke:live:full`，或用指挥舱的「一键全链路」按钮。
   产出在 `workspace/output/publish/<主题>-<时间戳>/`，含各平台变体：
   - 抖音 / 快手 → 1080×1920 竖屏（9:16）
   - B站 → 1920×1080 横屏（16:9）
2. **文案**：同一批次已生成标题、简介、标签（按各平台字数上限做过校验）
3. **上传**：到抖音 / 快手 / B站 的创作者中心 → 上传视频 → 粘贴文案 → 发布

> 发布前的规格校验用 `npm run smoke:live`（不渲染）或 UI 的「发布账号联调体检」，
> 它会检查成片文件、画幅比例、时长、标题/标签是否超限。

### 海外平台（可选）→ Postiz

**Postiz 不支持抖音、快手、B站**——它只支持海外平台（TikTok / YouTube / X / Instagram /
LinkedIn / Facebook / Bluesky / Mastodon 等 30+）。做海外才需要它：

1. 浏览器打开 **http://localhost:5000**
2. **注册账号**（首个注册的账号自动成为 admin）
   - 注册完建议把 `deployments/postiz/docker-compose.yml` 里 `DISABLE_REGISTRATION` 改成 `"true"`
     再 `docker compose ... up -d` 重启，避免后续被外人注册。
   - ⚠️ 用你自己注册的账号，不要用任何文档里出现过的示例凭据。
3. 进 **Settings → Channels**，连接你想用的海外平台（TikTok / YouTube / X …）
4. 连完后回到项目，一条命令探测：

```powershell
npm run postiz:channels            # 探测 Postiz 实际支持的渠道，并提示国内平台不支持
npm run postiz:channels -- --write # 把识别到的海外渠道 id 写回 .env.local
```

> TikTok 是国际版，和抖音是不同平台，两者账号体系互不相通。

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
| 找不到抖音/快手/B站的 channel | Postiz 不支持国内平台 | 第 1 步 A，用 social-auto-upload |
| dispatch 报 `blocked: 找不到 ... sau_cli.py` | `SOCIAL_AUTO_UPLOAD_DIR` 没配或路径错 | 第 1 步 A，指向 `A:\social-auto-upload` |
| dispatch 返回 preview 但没真发 | 三重闸门没全开（这是设计如此） | 第 1 步 A 的警示框 |
| 之前登过现在提示未登录 | Cookie 过期或平台风控 | `npm run sau:login -- -Platform x -Account y` 重新扫码 |
| 想发海外平台但 dispatch 无渠道 | 没在 Postiz 连海外渠道 | 第 1 步「海外平台」小节 |
| 抖音热榜空 | TTD 在跑但被风控 | `.env.local` 配 `TTD_DOUYIN_COOKIE`（公开热榜通常不需要） |

完整排查表见 [`CONFIG_AND_LAUNCH.md`](./CONFIG_AND_LAUNCH.md#3-排查表)。
