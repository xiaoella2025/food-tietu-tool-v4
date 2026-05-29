@echo off
cd /d "%~dp0"

echo ============================================
echo Food Tietu Tool - Assistant Trial V1
echo ============================================
echo.
echo Starting local server...
echo Do not close this window while using the tool.
echo.

where python >nul 2>nul
if %errorlevel%==0 (
    set PYTHON_CMD=python
) else (
    where py >nul 2>nul
    if %errorlevel%==0 (
        set PYTHON_CMD=py
    ) else (
        echo [ERROR] Python was not found.
        echo Please contact the administrator.
        echo.
        pause
        exit /b 1
    )
)

set PORT=7777

netstat -an | findstr ":7777 " | findstr "LISTENING" >nul 2>nul
if %errorlevel%==0 (
    echo Port 7777 is busy. Trying port 7778...
    set PORT=7778
)

echo.
echo Open this address in browser:
echo http://127.0.0.1:%PORT%/
echo.
echo The browser will open automatically.
echo.

start "" "http://127.0.0.1:%PORT%/"

%PYTHON_CMD% -m http.server %PORT% --bind 127.0.0.1

echo.
echo Server stopped.
pause
