# patches/ — 第三方工具的本仓改动

## TikTokDownloader 免费抖音热榜

[JoeanAmier/TikTokDownloader](https://github.com/JoeanAmier/TikTokDownloader)（Apache 2.0）本身能抓抖音热榜，但只在交互终端里、未暴露 HTTP API。本仓给它的 API server 补了一个 `/douyin/hot` 路由，调用其内部 `Hot` 接口，免费返回抖音热榜/娱乐榜/社会榜/挑战榜的热搜话题词。

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

### ⚠️ patch 与上游版本的对应关系

`ttd-douyin-hot.patch` 是针对 **commit `473c90f`**（2026-09 抓取的 master）生成的。
上游重构过目录结构，`git apply` 对版本敏感：

| 版本 | `_deal_hot_data` 位置 | patch 是否适用 |
|---|---|---|
| 旧版（2025 及更早） | `main_server.py` 内 | 旧 patch 适用 |
| `473c90f` 及邻近版本 | `main_terminal.py` 的 `TikTok` 基类 | 本 patch 适用 |

`APIServer(TikTok)` 继承自 `main_terminal.py` 的 `TikTok`，所以 `self._deal_hot_data(...)`
在 server 里依然可用；`APIModel` 在 `src/models/base.py`，需显式 import。

若 `git apply` 报上下文不匹配，说明上游又改了 `main_server.py`——按下面手工插入即可：

1. 在 `from ..translation import _` 之前加 `from ..models.base import APIModel`
2. 在 `/douyin/detail` 路由之前插入：

```python
        @self.server.post(
            "/douyin/hot",
            summary=_("获取抖音热榜数据"),
            description=_(dedent("""
                **参数**:

                - **cookie**: 抖音 Cookie；可选参数
                - **proxy**: 代理；可选参数
                """)),
            tags=[_("抖音")],
            response_model=DataResponse,
        )
        async def handle_hot(
            extract: APIModel, token: str = Depends(token_dependency)
        ):
            _time, data = await self._deal_hot_data(
                source=True,
                cookie=extract.cookie or None,
                proxy=extract.proxy or None,
            )
            if data:
                return self.success_response(extract, data)
            return self.failed_response(extract)
```

### 实测（2026-09-19）

在 `C:\Users\Administrator\Desktop\TikTokDownloader` 完成安装并跑通：

- `/token` → 200 `{"message":"验证成功！"}`
- `/douyin/hot` → 200，返回 4 个榜单：**抖音热榜 51 条 / 娱乐榜 50 条 / 社会榜 / 挑战榜**
- 单条字段：`word`（话题词）、`hot_value`、`view_count`、`sentence_id`、`group_id`
- 适配器把每个话题映射成一条 `TrendItem`：title=话题词，likes=hot_value，views=view_count

注：实时拉 4 个榜单约需 30s（含抖音签名），适配器默认超时已设 60s。公开热榜无需 Cookie。
