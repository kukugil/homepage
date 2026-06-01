@echo off
cd /d "%~dp0"

:: ============================================================
:: 探测 Python（依次尝试 python / py / python3）
:: ============================================================
set PYTHON=
python --version >nul 2>&1 && set PYTHON=python
if "%PYTHON%"=="" py --version >nul 2>&1 && set PYTHON=py
if "%PYTHON%"=="" python3 --version >nul 2>&1 && set PYTHON=python3

if "%PYTHON%"=="" (
    echo [FAIL] 未找到 Python，请先安装 Python 3.8+
    echo        下载: https://www.python.org/downloads/
    echo        安装时勾选 "Add Python to PATH"
    pause
    exit /b 1
)

:: ============================================================
:: 自动安装依赖
:: ============================================================
echo 正在检查依赖...
if exist "requirements.txt" (
    %PYTHON% -m pip install -r requirements.txt -q 2>nul
    if errorlevel 1 (
        echo [WARN] 依赖安装失败，尝试联网安装...
        %PYTHON% -m pip install openpyxl uiautomator2 -q
    )
) else (
    %PYTHON% -m pip install openpyxl uiautomator2 -q 2>nul
)
echo 依赖检查完成

:: ============================================================
:: 启动测试
:: ============================================================
%PYTHON% wifi_self_healing_test.py
pause
