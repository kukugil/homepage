@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion

:: ============================================================
:: WiFi 异常自愈能力测试 — 一键启动脚本
:: 用法:
::   双击 run.bat             → 默认 50 轮，自动检测 WiFi
::   run.bat 100              → 指定 100 轮
::   run.bat 50 -s MyWiFi     → 指定 SSID（不自动检测）
:: ============================================================

title WiFi 异常自愈能力测试

echo.
echo ============================================================
echo          WiFi 异常自愈能力测试 — 一键启动
echo ============================================================
echo.

:: ---- 检查 Python ----
echo [1/4] 检查 Python ...
python --version >nul 2>&1
if errorlevel 1 (
    echo [FAIL] 未找到 Python，请先安装 Python 3.8+
    echo        下载: https://www.python.org/downloads/
    pause
    exit /b 1
)
for /f "tokens=2" %%v in ('python --version 2^>^&1') do echo         Python %%v ✓

:: ---- 检查 ADB ----
echo [2/4] 检查 ADB ...
adb --version >nul 2>&1
if errorlevel 1 (
    echo [FAIL] 未找到 ADB，请将 ADB 添加到系统 PATH
    echo        下载: https://developer.android.com/studio/releases/platform-tools
    pause
    exit /b 1
)
for /f "tokens=1,2 delims= " %%a in ('adb version 2^>^&1 ^| findstr "Android"') do echo         ADB %%a %%b ✓

:: ---- 检查设备 ----
echo [3/4] 检查设备连接 ...
for /f "skip=1 tokens=1" %%d in ('adb devices 2^>nul ^| findstr /v "^*" ^| findstr /v "^$"') do (
    set DEVICE=%%d
)
if "%DEVICE%"=="" (
    echo [FAIL] 未检测到已连接的设备，请确认：
    echo         1. USB 已连接
    echo         2. 已开启 USB 调试
    echo         3. 已授权此电脑调试
    echo.
    echo 当前 adb devices 输出：
    adb devices
    pause
    exit /b 1
)
echo         设备: %DEVICE% ✓

:: ---- 安装 Python 依赖 ----
echo [4/4] 检查依赖 ...
pip show uiautomator2 >nul 2>&1
if errorlevel 1 (
    echo         正在安装 uiautomator2（可选，svc命令降级时才需要）...
    pip install uiautomator2 >nul 2>&1
    if errorlevel 1 (
        echo         [WARN] uiautomator2 安装失败，将仅使用 svc 命令
    ) else (
        echo         uiautomator2 安装完成 ✓
    )
) else (
    echo         uiautomator2 已安装 ✓
)

echo.
echo ============================================================
echo         环境检查完成，即将启动测试
echo ============================================================
echo.
echo   测试说明:
echo     - 每轮：重启设备 → 注入随机 WiFi 故障 → 自愈恢复
echo     - 方案一：开关 WiFi（svc 命令）
echo     - 方案二：飞行模式切换（方案一失败时触发）
echo     - 会自动检测当前连接的 WiFi SSID 和密码
echo     - 报告输出到 .\reports\ 目录
echo.
echo   按 Ctrl+C 可随时终止测试
echo ============================================================
echo.

:: ---- 解析参数 ----
set CYCLES=50
set EXTRA_ARGS=

if not "%~1"=="" (
    :: 检查第一个参数是否为纯数字
    set "ARG1=%~1"
    set "ISNUM=1"
    for /f "delims=0123456789" %%n in ("!ARG1!") do set "ISNUM=0"
    if "!ISNUM!"=="1" (
        set CYCLES=%~1
        shift
    )
)
:: 剩余参数原样传递
set EXTRA_ARGS=%*

:: ---- 运行测试 ----
echo 启动测试: %CYCLES% 轮
echo 额外参数: %EXTRA_ARGS%
echo.
python wifi_self_healing_test.py --cycles %CYCLES% %EXTRA_ARGS%

:: ---- 结束 ----
echo.
echo ============================================================
echo          测试完成
echo ============================================================
echo   报告保存在: .\reports\
echo   逐轮日志:   .\reports\logs\
echo.
pause
