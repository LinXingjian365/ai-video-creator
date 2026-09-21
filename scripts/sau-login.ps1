# 引导登录 social-auto-upload 的国内平台账号(扫码一次,之后复用 Cookie)
#
# 用法:
#   powershell -File scripts/sau-login.ps1 -Platform douyin -Account my_douyin
#   powershell -File scripts/sau-login.ps1 -Platform bilibili -Account my_bili -Check
#
# 说明:
#   - 会打开一个真实浏览器窗口,用对应 App 扫码即可;登录态存到 <安装目录>\cookies\
#   - -Check 只验证已有登录态是否仍然有效,不打开扫码
#   - 支持平台: douyin / kuaishou / bilibili / xiaohongshu / tencent(视频号) / baijiahao ...

param(
    [Parameter(Mandatory = $true)]
    [ValidateSet("douyin", "kuaishou", "bilibili", "xiaohongshu", "tencent", "baijiahao", "weibo", "hupu")]
    [string]$Platform,

    [Parameter(Mandatory = $true)]
    [string]$Account,

    [switch]$Check
)

$ErrorActionPreference = "Stop"

# 1) 定位 social-auto-upload 安装目录
$dir = $env:SOCIAL_AUTO_UPLOAD_DIR
if (-not $dir) {
    foreach ($candidate in @("A:\social-auto-upload", (Join-Path $HOME "social-auto-upload"), "C:\social-auto-upload")) {
        if (Test-Path (Join-Path $candidate "sau_cli.py")) { $dir = $candidate; break }
    }
}

if (-not $dir -or -not (Test-Path (Join-Path $dir "sau_cli.py"))) {
    Write-Host "找不到 social-auto-upload。" -ForegroundColor Red
    Write-Host "请按 docs/MANUAL_SETUP.md 安装,或用环境变量 SOCIAL_AUTO_UPLOAD_DIR 指定安装目录。"
    exit 1
}

$python = Join-Path $dir ".venv\Scripts\python.exe"
if (-not (Test-Path $python)) {
    Write-Host "找不到 $python。请先在该目录建 venv 并安装依赖。" -ForegroundColor Red
    exit 1
}

$action = if ($Check) { "check" } else { "login" }
Write-Host "→ sau $Platform $action --account $Account" -ForegroundColor Cyan
if (-not $Check) {
    Write-Host "  稍后会弹出浏览器窗口,请用对应 App 扫码登录。" -ForegroundColor Yellow
}

Set-Location $dir

# login 需要带界面才能扫码;check 不需要浏览器
# 例外:bilibili 走 biliup 官方 CLI(终端交互式扫码),它没有 --headed 参数
if ($Check -or $Platform -eq "bilibili") {
    & $python sau_cli.py $Platform $action --account $Account
} else {
    & $python sau_cli.py $Platform $action --account $Account --headed
}

$code = $LASTEXITCODE
Write-Host ""
if ($code -eq 0) {
    Write-Host "✓ $Platform 登录态已就绪(cookies\$($Platform)_$Account.json)" -ForegroundColor Green
    Write-Host "  记得在 .env.local 里设置 SOCIAL_AUTO_UPLOAD_ACCOUNT_$($Platform.ToUpper())="$Account
} else {
    Write-Host "✗ 退出码 $code。常见原因:浏览器未弹出 / 扫码超时 / 平台风控。" -ForegroundColor Red
}
exit $code
