# 启动 TikTokDownloader(抖音热榜免费数据源,监听 127.0.0.1:5555)
#
# 用法:
#   powershell -File scripts/start-ttd.ps1
#   powershell -File scripts/start-ttd.ps1 -TtdDir "D:\tools\TikTokDownloader"
#
# 首次安装见 patches/README.md。本脚本只负责"起服务",不负责安装。

param(
    [string]$TtdDir = $env:TTD_DIR
)

$ErrorActionPreference = "Stop"

# 1) 定位安装目录:显式参数 > 环境变量 TTD_DIR > 常见位置
$defaultPaths = @(
    (Join-Path $HOME "Desktop\TikTokDownloader"),
    (Join-Path $HOME "TikTokDownloader"),
    "C:\TikTokDownloader"
)

if (-not $TtdDir) {
    foreach ($p in $defaultPaths) {
        if (Test-Path (Join-Path $p "run_api.py")) { $TtdDir = $p; break }
    }
}

if (-not $TtdDir -or -not (Test-Path $TtdDir)) {
    Write-Host "找不到 TikTokDownloader 安装目录。" -ForegroundColor Red
    Write-Host "请先按 patches/README.md 安装,然后用 -TtdDir 指定路径,或设置环境变量 TTD_DIR。"
    exit 1
}

$python = Join-Path $TtdDir ".venv\Scripts\python.exe"
if (-not (Test-Path $python)) {
    Write-Host "在 $TtdDir 下没找到 .venv\Scripts\python.exe,请先完成 venv 与依赖安装。" -ForegroundColor Red
    exit 1
}

# 2) 已在跑就别重复起
try {
    $r = Invoke-WebRequest -Uri "http://127.0.0.1:5555/token" -TimeoutSec 3 -UseBasicParsing
    Write-Host "TTD 已在运行(HTTP $($r.StatusCode)),无需重复启动。" -ForegroundColor Green
    exit 0
} catch {
    # 没在跑,继续
}

Write-Host "启动 TTD:$TtdDir"
Set-Location $TtdDir
Start-Process -FilePath $python -ArgumentList "run_api.py" -WorkingDirectory $TtdDir -WindowStyle Minimized

# 3) 等它起来并自检(拉 4 个榜单约 30s,这里只探 /token)
for ($i = 0; $i -lt 30; $i++) {
    Start-Sleep -Seconds 1
    try {
        $r = Invoke-WebRequest -Uri "http://127.0.0.1:5555/token" -TimeoutSec 2 -UseBasicParsing
        Write-Host "TTD 已就绪(HTTP $($r.StatusCode)) http://127.0.0.1:5555" -ForegroundColor Green
        exit 0
    } catch {
        # 继续等
    }
}

Write-Host "TTD 启动超时(30s)。请到弹出的窗口里看报错。" -ForegroundColor Red
exit 1
