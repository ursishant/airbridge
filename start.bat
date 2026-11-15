@echo off
setlocal enabledelayedexpansion

title AirBridge - Multi-Device Continuity Bridge
echo ============================================================
echo   AirBridge: Multi-Device LAN ^& Office Connection Bridge
echo ============================================================
echo.

REM Check if Node.js is installed
where node >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Node.js is not found on your system.
    echo Please install Node.js 18+ from https://nodejs.org
    echo Then run this script again.
    pause
    exit /b 1
)

REM Navigate to project root directory
cd /d "%~dp0"

REM Check server dependencies
if not exist "server\node_modules" (
    echo [*] Installing server dependencies...
    cd server
    call npm install
    cd ..
)

REM Check if frontend is built
if not exist "server\public\index.html" (
    echo [*] Production frontend build not found. Building now...
    cd frontend
    if not exist "node_modules" (
        echo [*] Installing frontend dependencies...
        call npm install
    )
    call npm run build
    cd ..
)

echo [*] Starting AirBridge server...
echo.
set PORT=5050
set AUTO_OPEN=true
node server\index.js

if %ERRORLEVEL% neq 0 (
    echo [ERROR] Server exited with an error.
    pause
)
