@echo off
cd /d "%~dp0"

echo ============================================
echo Food Tietu Tool - Assistant Trial V1
echo ============================================
echo.
echo Starting server via PowerShell...
echo Do not close this window while using the tool.
echo.

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0server.ps1"

echo.
echo Server stopped.
pause
