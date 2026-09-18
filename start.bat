@echo off
setlocal
cd /d "%~dp0"
title Localhost AI Chat Web UI

echo =======================================================
echo          Localhost AI Chat Web UI Server
echo =======================================================
echo.
echo Starting local web server with automatic CORS bypass...
echo.
echo Application URL: http://localhost:8000
echo.
echo Press Ctrl+C in this window to stop the server.
echo =======================================================
echo.

:: Automatically launch the default browser
start "" http://localhost:8000

:: Check for python server.py
where python >nul 2>&1
if %ERRORLEVEL% equ 0 (
    python server.py 8000
    goto :eof
)

:: Check for py server.py
where py >nul 2>&1
if %ERRORLEVEL% equ 0 (
    py server.py 8000
    goto :eof
)

:: Fallback: Check if Node/npx is available
where npx >nul 2>&1
if %ERRORLEVEL% equ 0 (
    npx serve -l 8000
    goto :eof
)

echo [ERROR] Python was not found on your system.
echo Please install Python (https://www.python.org/) to run the local server.
echo.
pause
