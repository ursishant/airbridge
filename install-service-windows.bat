@echo off
setlocal

echo ============================================================
echo   Installing AirBridge 24/7 Windows Background Service
echo ============================================================
echo.

set "SCRIPT_DIR=%~dp0"
set "STARTUP_DIR=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"
set "VBS_FILE=%STARTUP_DIR%\AirBridge.vbs"

REM Ensure Node.js is available
where node >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Node.js is required to install the AirBridge background service.
    echo Please install Node.js from https://nodejs.org
    pause
    exit /b 1
)

REM Build frontend if missing
if not exist "%SCRIPT_DIR%server\public\index.html" (
    echo [*] Building frontend bundle...
    cd /d "%SCRIPT_DIR%frontend"
    call npm run build
    cd /d "%SCRIPT_DIR%"
)

REM Create silent background launcher in Startup folder
echo Set WshShell = CreateObject("WScript.Shell") > "%VBS_FILE%"
echo WshShell.CurrentDirectory = "%SCRIPT_DIR%" >> "%VBS_FILE%"
echo WshShell.Run "node server\index.js", 0, False >> "%VBS_FILE%"

echo [SUCCESS] AirBridge background service registered in Windows Startup folder:
echo   %VBS_FILE%
echo.
echo AirBridge will now start automatically in the background whenever Windows boots.
echo Starting service now in background...
cscript //nologo "%VBS_FILE%"
echo AirBridge is now running on http://localhost:5050
echo.
pause
