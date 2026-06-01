@echo off
:: 切换到脚本所在目录（修复双击时工作目录不对的问题）
cd /d "%~dp0"

title WiFi 异常自愈能力测试

echo.
echo  ============================================================
echo           WiFi 异常自愈能力测试 — 一键启动
echo  ============================================================
echo.

:: ============================================================
:: 第 1 步：检查 Python
:: ============================================================
echo  [1/4] 检查 Python ...
python --version >nul 2>&1
if errorlevel 1 (
    echo  [FAIL] 未找到 Python，请先安装 Python 3.8+
    echo         下载: https://www.python.org/downloads/
    pause
    exit /b 1
)
python --version 2>&1 | findstr /i "Python" >nul
echo         Python 已安装 ✓

:: ============================================================
:: 第 2 步：检查 ADB
:: ============================================================
echo  [2/4] 检查 ADB ...
adb --version >nul 2>&1
if errorlevel 1 (
    echo  [FAIL] 未找到 ADB
    echo         1. 下载 Platform Tools: https://developer.android.com/studio/releases/platform-tools
    echo         2. 解压后将目录加入系统 PATH 环境变量
    echo         3. 或把 adb.exe 复制到此脚本同目录
    pause
    exit /b 1
)
echo         ADB 已安装 ✓

:: ============================================================
:: 第 3 步：检查设备
:: ============================================================
echo  [3/4] 检查设备连接 ...

set "DEVICE="
for /f "skip=1 tokens=1" %%d in ('adb devices 2^>nul') do (
    set "LINE=%%d"
    if not "!LINE!"=="List" if not "!LINE!"=="" if "!LINE:~0,1!" neq "*" (
        if "!DEVICE!"=="" set "DEVICE=%%d"
    )
)

if "%DEVICE%"=="" (
    echo  [FAIL] 未检测到设备
    echo.
    echo  当前 adb devices 输出：
    adb devices
    echo.
    echo  请确认：
    echo    1. USB 已连接
    echo    2. 已开启「USB 调试」（设置 - 开发者选项）
    echo    3. 已在设备上点击「允许 USB 调试」
    pause
    exit /b 1
)
echo         设备: %DEVICE% ✓

:: ============================================================
:: 第 4 步：检查 Python 依赖
:: ============================================================
echo  [4/4] 检查依赖 ...
pip show uiautomator2 >nul 2>&1
if errorlevel 1 (
    echo         正在安装 uiautomator2（可选，svc 命令降级时才需要）...
    pip install uiautomator2 -q 2>nul
    if errorlevel 1 (
        echo         [WARN] uiautomator2 安装失败（不影响主要功能）
    ) else (
        echo         uiautomator2 安装完成 ✓
    )
) else (
    echo         uiautomator2 已安装 ✓
)

:: ============================================================
:: 第 5 步：交互式配置参数
:: ============================================================
echo.
echo  ============================================================
echo          配置测试参数
echo  ============================================================
echo.
echo  直接按 Enter 使用默认值（括号内为默认值）
echo.

:: --- 测试轮数 ---
set "CYCLES=50"
set /p "CYCLES=  测试轮数 [50]: "
if "%CYCLES%"=="" set "CYCLES=50"
:: 验证是否为数字
set "TMP=%CYCLES%"
set "ISNUM=1"
for /f "delims=0123456789" %%n in ("%TMP%") do set "ISNUM=0"
if "%ISNUM%"=="0" (
    echo  输入无效，使用默认值 50
    set "CYCLES=50"
)

:: --- 开机等待时间 ---
set "BOOT_WAIT=15"
set /p "BOOT_WAIT=  开机后等待秒数 [15]: "
if "%BOOT_WAIT%"=="" set "BOOT_WAIT=15"
set "TMP=%BOOT_WAIT%"
set "ISNUM=1"
for /f "delims=0123456789" %%n in ("%TMP%") do set "ISNUM=0"
if "%ISNUM%"=="0" (
    echo  输入无效，使用默认值 15
    set "BOOT_WAIT=15"
)

:: --- WiFi 凭据 ---
echo.
echo  WiFi 连接验证（可选）
echo    - 留空 = 自动检测当前连接的 WiFi SSID 和密码
echo    - 输入 SSID = 手动指定 WiFi
echo    - 输入 none = 跳过连接验证，仅验证扫描恢复
echo.
set /p "SSID=  WiFi SSID [自动检测]: "
if /i "%SSID%"=="none" set "SSID="

if not "%SSID%"=="" (
    set /p "PASSWORD=  WiFi 密码: "
    set "PASS_ARG=--password !PASSWORD!"
    set "SSID_ARG=--ssid !SSID!"
    :: 用户手动指定了 SSID，禁用自动检测
    set "AUTO_ARG=--no-auto-detect"
) else (
    :: SSID 为空 = 自动检测 + 自动获取密码
    echo         将自动检测当前连接的 WiFi SSID 和密码
    set "SSID_ARG="
    set "PASS_ARG="
    set "AUTO_ARG="
)

:: --- 输出目录 ---
set "OUTPUT=.\reports"
set /p "OUTPUT=  报告输出目录 [.\reports]: "
if "%OUTPUT%"=="" set "OUTPUT=.\reports"

:: ============================================================
:: 确认并启动
:: ============================================================
echo.
echo  ============================================================
echo          确认配置
echo  ============================================================
echo   测试轮数:     %CYCLES%
echo   开机等待:     %BOOT_WAIT% 秒
if not "%SSID%"=="" (
    echo   WiFi SSID:    %SSID%
    echo   WiFi 密码:    (已输入)
) else (
    echo   WiFi 凭据:    自动检测
)
echo   报告目录:     %OUTPUT%
echo.
set /p "CONFIRM=  确认启动？[Y/n]: "
if /i "%CONFIRM%"=="n" (
    echo  已取消
    pause
    exit /b 0
)

:: ============================================================
:: 运行测试
:: ============================================================
echo.
echo  ============================================================
echo          正在启动测试...
echo  ============================================================
echo   提示: 按 Ctrl+C 可随时终止测试
echo.
python wifi_self_healing_test.py --cycles %CYCLES% --boot-wait %BOOT_WAIT% %SSID_ARG% %PASS_ARG% %AUTO_ARG% --output "%OUTPUT%"

:: ============================================================
:: 结束
:: ============================================================
echo.
echo  ============================================================
echo          测试结束
echo  ============================================================
echo   报告目录: %OUTPUT%
echo            %OUTPUT%\wifi_healing_*.json
echo            %OUTPUT%\wifi_healing_*.html
echo   逐轮日志: %OUTPUT%\logs\
echo.
pause
