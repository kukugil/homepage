@echo off
cd /d "%~dp0"

:: Try python / py / python3
set PY=
python --version >nul 2>&1 && set PY=python
if "%PY%"=="" py --version >nul 2>&1 && set PY=py
if "%PY%"=="" python3 --version >nul 2>&1 && set PY=python3

if "%PY%"=="" (
    echo Python not found. Please install Python 3.8+
    echo Download: https://www.python.org/downloads/
    pause
    exit /b 1
)

:: Install deps, then run
%PY% -m pip install openpyxl uiautomator2 -q 2>nul
%PY% wifi_self_healing_test.py
pause
