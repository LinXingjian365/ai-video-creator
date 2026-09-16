# patches/ — 第三方工具的本仓改动

## TikTokDownloader 免费抖音热榜

[JoeanAmier/TikTokDownloader](https://github.com/JoeanAmier/TikTokDownloader)（Apache 2.0）本身能抓抖音热榜，但只在交互终端里、未暴露 HTTP API。本仓给它的 API server 补了一个 `/douyin/hot` 路由，调用其内部 `src/interface/hot.py` 的 HotBoard 接口，免费返回抖音热榜/娱乐/社会/挑战四榜的热搜话题词。

`src/lib/trend/sources/tiktok-downloader.ts` 适配器消费该端点。

### 复现步骤

```bash
git clone --depth 1 https://github.com/JoeanAmier/TikTokDownloader.git
cd TikTokDownloader
python -m venv .venv                       # 需 Python >=3.12
.venv/Scripts/python.exe -m pip install -r requirements.txt
git apply /path/to/patches/ttd-douyin-hot.patch    # 加 /douyin/hot 路由
cp /path/to/patches/ttd-run_api.py run_api.py       # 非交互启动脚本
.venv/Scripts/python.exe run_api.py                 # 监听 127.0.0.1:5555
```

然后在本项目 `.env.local` 设 `TTD_ENABLED=true` + `TTD_BASE_URL=http://127.0.0.1:5555`，
抖音趋势源即从 TikHub（计费）切到 TTD（免费）。

- `ttd-douyin-hot.patch` — 给 `src/application/main_server.py` 增加 `/douyin/hot` POST 路由
- `ttd-run_api.py` — 绕过交互菜单直接启动 API server 的脚本

注:实时拉 4 个榜单约需 30s(含抖音签名),适配器默认超时已设 60s。公开热榜无需 Cookie。
