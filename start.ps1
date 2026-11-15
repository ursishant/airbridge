# AirBridge - Multi-Device Continuity Bridge for Windows PowerShell
$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
Set-Location $scriptDir

Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "   AirBridge: Multi-Device LAN & Office Connection Bridge  " -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host ""

# Verify Node.js installation
try {
    $nodeVersion = node --version
    Write-Host "[OK] Detected Node.js: $nodeVersion" -ForegroundColor Green
} catch {
    Write-Host "[ERROR] Node.js is not installed or not in PATH." -ForegroundColor Red
    Write-Host "Please download and install Node.js 18+ from https://nodejs.org" -ForegroundColor Yellow
    exit 1
}

# Install server dependencies if missing
if (-not (Test-Path "$scriptDir\server\node_modules")) {
    Write-Host "[*] Installing server packages..." -ForegroundColor Yellow
    Set-Location "$scriptDir\server"
    npm install
    Set-Location $scriptDir
}

# Build frontend if not present
if (-not (Test-Path "$scriptDir\server\public\index.html")) {
    Write-Host "[*] Building frontend assets..." -ForegroundColor Yellow
    Set-Location "$scriptDir\frontend"
    if (-not (Test-Path "$scriptDir\frontend\node_modules")) {
        npm install
    }
    npm run build
    Set-Location $scriptDir
}

Write-Host "[*] Starting AirBridge on port 5050..." -ForegroundColor Cyan
$env:PORT = "5050"
$env:AUTO_OPEN = "true"
node "$scriptDir\server\index.js"
