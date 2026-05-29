@echo off
chcp 65001 >nul
title 美食养生贴图工具 - 本地服务

echo.
echo  ============================================
echo   美食养生贴图工具 · 助理试用版 V1
echo  ============================================
echo.
echo  正在启动本地服务，请稍候...
echo.
echo  ★ 重要提示：请不要关闭此窗口！
echo    关闭后工具会停止运行。
echo.

:: 检查 Python 是否可用
python --version >nul 2>&1
if %errorlevel% neq 0 (
    py --version >nul 2>&1
    if %errorlevel% neq 0 (
        echo  [错误] 未检测到 Python。
        echo.
        echo  请联系管理员安装 Python（https://python.org），
        echo  或使用管理员提供的运行环境。
        echo.
        pause
        exit /b 1
    )
    set PYTHON_CMD=py
) else (
    set PYTHON_CMD=python
)

:: 检查端口 7777 是否已被占用
netstat -an 2>nul | findstr ":7777 " | findstr "LISTENING" >nul
if %errorlevel% equ 0 (
    echo  [提示] 端口 7777 已被占用，尝试使用端口 7778...
    set PORT=7778
) else (
    set PORT=7777
)

echo  服务地址：http://127.0.0.1:%PORT%
echo.
echo  稍后将自动打开浏览器...
echo.

:: 等待 1.5 秒后打开浏览器（等服务启动）
start "" /wait timeout /t 1 /nobreak >nul
start "" "http://127.0.0.1:%PORT%"

:: 启动 Python HTTP 服务器（当前目录）
%PYTHON_CMD% -m http.server %PORT% --bind 127.0.0.1

echo.
echo  服务已停止。按任意键关闭此窗口。
pause >nul
