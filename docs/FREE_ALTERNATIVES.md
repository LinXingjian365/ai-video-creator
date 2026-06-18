# 付费方案的免费/开源替代

调研日期: 2026-06-18
目的: 项目里所有"需要付费 key"的能力,都尽量找到免费/开源/自托管的等效方案,避免把成本锁死在第三方 SaaS 上。

---

## TL;DR 映射表

| 当前付费方案 | 月费 | 免费/开源替代 | 维护成本 |
|---|---|---|---|
| Postiz 托管版 (postiz.com) | $23-99/月 | Postiz 自托管 (Apache 2.0) | VPS $4-12/月 |
| TikHub 抖音搜索 | 充值制 (每调用扣费) | TikTokDownloader (Apache 2.0, 11.4k★) | 0,本地 Docker |
| TikHub 快手 | 充值制 | KS-Downloader (同作者) | 0,本地 Docker |
| n8n Cloud | $24-60/月 | n8n Community Edition (Fair Code) | VPS $4-12/月 |
| BGM 商业曲库 | 订阅制 | 本地 BGM 库 (Pixabay/Mixkit/FreePD) | 0,纯文件 |

---

## 1. Postiz: 自托管 (Apache 2.0)

[github.com/gitroomhq/postiz-app](https://github.com/gitroomhq/postiz-app) | [docs.postiz.com](https://docs.postiz.com/quickstart)

**关键事实**: 项目里 `src/lib/publish/dispatch.ts` 已经写了 Postiz adapter。**$29/月只是托管费,代码本身免费**。自托管后 API/integration ID 都你自己掌控,无月费。

### Docker Compose 自托管最小配置

```yaml
# docker-compose.yml (放仓库根 deployments/postiz/ 下)
services:
  postiz:
    image: ghcr.io/gitroomhq/postiz-app:latest
    container_name: postiz
    restart: unless-stopped
    environment:
      MAIN_URL: "http://localhost:5000"
      FRONTEND_URL: "http://localhost:5000"
      NEXT_PUBLIC_BACKEND_URL: "http://localhost:5000/api"
      JWT_SECRET: "<openssl rand -hex 32 生成>"
      DATABASE_URL: "postgresql://postiz:postiz@postiz-postgres:5432/postiz"
      REDIS_URL: "redis://postiz-redis:6379"
      DISABLE_REGISTRATION: "false"  # 创号后立即改 true
    ports:
      - "5000:5000"
    depends_on:
      - postiz-postgres
      - postiz-redis

  postiz-postgres:
    image: postgres:17-alpine
    environment:
      POSTGRES_USER: postiz
      POSTGRES_PASSWORD: postiz
      POSTGRES_DB: postiz
    volumes:
      - postiz-pg:/var/lib/postgresql/data

  postiz-redis:
    image: redis:7.2-alpine

volumes:
  postiz-pg:
```

### 接入本项目

1. `docker compose up -d` 拉起
2. 浏览器开 `http://localhost:5000` → 注册第一个号(自动 admin)
3. 立即把 docker-compose 里 `DISABLE_REGISTRATION` 改 `true`,重启
4. 在 Postiz 后台连接抖音/快手/B站 integration → 拿 `integration_id`
5. `.env.local` 写:
   ```
   PUBLISH_LIVE_ENABLED=true
   POSTIZ_BASE_URL=http://localhost:5000
   POSTIZ_API_KEY=<Postiz 后台生成>
   POSTIZ_INTEGRATION_ID_DOUYIN=<...>
   POSTIZ_INTEGRATION_ID_KUAISHOU=<...>
   POSTIZ_INTEGRATION_ID_BILIBILI=<...>
   ```
6. 现有 `/api/publish/dispatch` 直接走自托管 Postiz,创建 `draft`,人工确认后再点 publish

**注意**: Postiz 创建的是 draft,不会自动发,正好符合本项目"绝不静默上传"的安全闸门。

---

## 2. TikTokDownloader (JoeanAmier): 替代 TikHub 抖音搜索

[github.com/JoeanAmier/TikTokDownloader](https://github.com/JoeanAmier/TikTokDownloader) | 11.4k★ | Apache 2.0

**关键事实**: TikHub 的原作者 Evil0ctal 项目其实是开源的,只是他停更去做 TikHub 商业化了。JoeanAmier 这套是替代品,**显式支持搜索/热榜/评论/账号采集**,不收钱,Docker 现成。

### 一键起 Docker

```bash
docker pull joeanamier/tiktok-downloader
docker run --name ttd -d -p 5555:5555 \
  -v tiktok_downloader_volume:/app/Volume \
  joeanamier/tiktok-downloader
```

### REST API

监听 `http://127.0.0.1:5555`,所有端点 POST + JSON。例子:

```bash
# 搜索 (替代 TikHub douyin search)
curl -X POST http://127.0.0.1:5555/douyin/search \
  -H "token: " \
  -H "Content-Type: application/json" \
  -d '{"query":"AI剪辑","pages":2}'

# 热榜
curl -X POST http://127.0.0.1:5555/douyin/hot \
  -H "token: " \
  -d '{}'

# 单视频详情
curl -X POST http://127.0.0.1:5555/douyin/detail \
  -H "token: " \
  -d '{"detail_id":"7123456789"}'

# 评论
curl -X POST http://127.0.0.1:5555/douyin/comment \
  -H "token: " \
  -d '{"detail_id":"7123456789","pages":2}'
```

### Cookie (重要)

抖音有风控,**必须**在 `Volume/settings.json` 里塞一份浏览器抓的 Cookie。否则只能调用部分公开端点。流程:
1. Chrome 登录抖音网页版
2. F12 → Application → Cookies → 复制 `www.douyin.com` 全部
3. 写进容器 volume 的 `settings.json` 的 `cookie` 字段

### 接入本项目

新增一个 adapter,与现有 `src/lib/trend/sources/tikhub.ts` 并列,然后让 `src/lib/trend/sources/registry.ts` 多一个 `provider=local-ttd` 选项:

```typescript
// 草案: src/lib/trend/sources/tiktok-downloader.ts
const BASE = process.env.TTD_BASE_URL ?? "http://127.0.0.1:5555";

export async function fetchDouyinSearchViaTTD(query: string, limit = 10) {
  const r = await fetch(`${BASE}/douyin/search`, {
    method: "POST",
    headers: { "Content-Type": "application/json", token: "" },
    body: JSON.stringify({ query, pages: Math.ceil(limit / 10) })
  });
  if (!r.ok) throw new Error(`TTD HTTP ${r.status}: ${await r.text()}`);
  return r.json();
}
```

复用现有的 `mapTikHubTrendResponse` 字段映射器(字段名相似),省去重写归一化。

---

## 3. KS-Downloader: 快手版本

[github.com/JoeanAmier/KS-Downloader](https://github.com/JoeanAmier/KS-Downloader) | Apache 2.0

JoeanAmier 同作者的快手姊妹项目。TikTokDownloader **不包含**快手,快手必须用这个。Docker 部署套路完全一致,端点形状对齐 KS 自己的 API 字段。

---

## 4. n8n: Community Edition 自托管

[docs.n8n.io/hosting](https://docs.n8n.io/hosting/) | Fair Code License (自托管完全免费)

**关键事实**: 项目已经接了 n8n payload 生成 + workflow JSON 导出。n8n Cloud $24/月 2500 执行配额——一个 5 分钟定时任务能 9 天就爆了。Community Edition **无执行限制、无 workflow 数限制**,只缺 SSO/审计这些企业功能。

### Docker Compose

```yaml
# deployments/n8n/docker-compose.yml
services:
  n8n:
    image: n8nio/n8n:latest
    restart: unless-stopped
    ports:
      - "5678:5678"
    environment:
      N8N_HOST: localhost
      N8N_PORT: 5678
      N8N_PROTOCOL: http
      WEBHOOK_URL: "http://localhost:5678/"
      GENERIC_TIMEZONE: "Asia/Shanghai"
      N8N_RUNNERS_ENABLED: "true"
    volumes:
      - n8n_data:/home/node/.n8n

volumes:
  n8n_data:
```

### 接入本项目

1. `docker compose up -d`
2. 浏览器开 `http://localhost:5678` → 注册账号
3. `.env.local`:
   ```
   N8N_WEBHOOK_URL=http://localhost:5678/webhook/full-chain
   N8N_WEBHOOK_SECRET=<openssl rand -hex 16>
   CONFIRM_N8N_WEBHOOK=true
   ```
4. 在 UI"运营复盘"面板点"导出 workflow JSON" → 拿到 `workspace/drafts/n8n-workflow-*.json`
5. n8n 后台 → Workflows → Import from File → 选这个 JSON
6. 改 webhook 节点的 URL/认证后激活

---

## 5. BGM 本地库: 不需要 API

最简单可靠的方案。项目 `src/lib/audio-mix.ts` 接受任意本地路径作 BGM。

### 推荐免费来源(CC0 / 无需署名 / 可商用)

| 来源 | 协议 | 数量 | 适合 |
|---|---|---|---|
| [Pixabay Music](https://pixabay.com/music/) | CC0 | 数千 | 通用短视频 |
| [Mixkit](https://mixkit.co/free-stock-music/) | Mixkit License (免费商用,无需署名) | 上千 | 现代电子/科技感 |
| [FreePD](https://freepd.com/) | CC0 | 几百 | 经典/管弦 |
| [Free Music Archive](https://freemusicarchive.org/) | 混合 (按曲查协议) | 1.3万 | 独立音乐家 |

(Pixabay/Mixkit/FreePD 都不要求署名;FMA 看具体曲目协议)

### 维护方式

```bash
# 在 workspace/input/audio 下按曲风分目录
workspace/input/audio/
  uplifting/
    sora-upbeat-electronic.mp3
    pixabay-tech-future.mp3
  calm/
    freepd-piano-ambient.mp3
  ...
```

然后 `ScriptDraft.bgm` 字段拿 LLM 推荐的曲风 → 字符串匹配本地目录 → 喂给 `mixBackgroundMusic({ bgmPath: ... })`。

后续可写 `src/lib/bgm/library.ts`(待定): 扫描 `workspace/input/audio`,按文件名/目录归类,提供 `pickBgmByMood(mood: string): string`。

---

## 优先级建议

按"成本 × 价值 × 实现难度"排:

1. **n8n 自托管** (难度:低, 价值:高) — 已有导出 JSON,起 Docker 5 分钟搞定
2. **BGM 本地库** (难度:低, 价值:中) — 项目已支持任意 mp3 路径,只缺一个 `bgm/library.ts` 选曲器
3. **Postiz 自托管** (难度:中, 价值:高) — Postgres + Redis + Postiz 三容器,搭起来要半小时,但能省最多钱
4. **TikTokDownloader 自托管** (难度:中, 价值:高) — Docker 一行命令,但需要手动维护抖音 Cookie 防风控
5. **KS-Downloader** (难度:中, 价值:中) — 同上但仅在你重度用快手时优先级才高

---

## 路线图调整建议

把 HANDOFF 里的"配置真实 TIKHUB_API_KEY"和"Postiz 充钱"这两项,改成:
- "起 TikTokDownloader 容器,新增 `src/lib/trend/sources/tiktok-downloader.ts` adapter,让 trend-report 多一个 `provider=local-ttd` 选项"
- "起 Postiz 自托管,配 integration → /api/publish/dispatch 真实联调"

这样不花一分钱也能把发布矩阵和深度热点研究跑通。
