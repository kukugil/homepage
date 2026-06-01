# ============================================================
# WiFi 异常自愈能力测试 — 一键启动 (PowerShell)
# 双击 run.bat 即可调用此脚本（解决编码问题）
# ============================================================

$ErrorActionPreference = "Stop"
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $scriptDir

Write-Host ""
Write-Host "============================================================"
Write-Host "       WiFi 异常自愈能力测试 — 一键启动"
Write-Host "============================================================"
Write-Host ""

# ---- 1. 探测 Python ----
Write-Host "[1/3] 检测 Python ..."
$python = $null
foreach ($cmd in @("python", "py", "python3")) {
    try {
        $null = & $cmd --version 2>$null
        $python = $cmd
        $ver = & $cmd --version 2>&1
        Write-Host "       $ver  [OK]"
        break
    } catch {}
}
if (-not $python) {
    Write-Host "[FAIL] 未找到 Python，请先安装 Python 3.8+"
    Write-Host "       下载: https://www.python.org/downloads/"
    Write-Host "       安装时勾选 'Add Python to PATH'"
    Read-Host "`n按 Enter 退出"
    exit 1
}

# ---- 2. 安装依赖 ----
Write-Host "[2/3] 检查依赖 ..."
try {
    & $python -m pip install openpyxl uiautomator2 -q 2>$null
    Write-Host "       依赖就绪 [OK]"
} catch {
    Write-Host "       [WARN] 依赖安装失败，将跳过 Excel 报告"
}

# ---- 3. 启动测试 ----
Write-Host "[3/3] 启动测试 ..."
Write-Host "============================================================"
Write-Host "  提示: 按 Ctrl+C 可随时终止测试"
Write-Host "============================================================"
Write-Host ""

& $python wifi_self_healing_test.py

Write-Host ""
Write-Host "============================================================"
Write-Host "       测试完成"
Write-Host "============================================================"
Write-Host "  报告保存在: .\reports"
Write-Host ""

Read-Host "按 Enter 退出"
