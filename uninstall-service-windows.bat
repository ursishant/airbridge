@echo off
setlocal

echo ============================================================
echo   Uninstalling AirBridge Windows Background Service
echo ============================================================
echo.

set "STARTUP_DIR=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"
set "VBS_FILE=%STARTUP_DIR%\AirBridge.vbs"

if exist "%VBS_FILE%" (
    del /f /q "%VBS_FILE%"
    echo [OK] Removed startup shortcut: %VBS_FILE%
) else (
    echo [*] Startup shortcut was not found.
)

REM Kill any running node instance on port 5050
for /f "tokens=5" %%a in ('netstat -aon ^| find ":5050" ^| find "LISTENING"') do (
    taskkill /F /PID %%a >nul 2>nul
    echo [OK] Stopped AirBridge background process (PID: %%a)
)

echo.
echo [SUCCESS] AirBridge Windows background service uninstalled successfully.
echo.
pause
