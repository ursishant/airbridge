#!/usr/bin/env bash

# AirBridge: macOS <-> Android Instant Connection
# Simple launcher script

set -e

DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"
cd "$DIR"

echo "[*] Starting AirBridge (macOS <-> Android Bridge)..."

# Check node
if ! command -v node &> /dev/null; then
    echo "[Error] Node.js is not found. Please install Node.js from https://nodejs.org"
    exit 1
fi

# If server/public doesn't exist, build it
if [ ! -d "server/public" ]; then
    echo "[*] Building frontend assets..."
    cd frontend && npm run build && cd ..
fi

# Check if AirBridge is already running in the background
if curl -s http://localhost:5050/api/info > /dev/null 2>&1; then
    INFO=$(curl -s http://localhost:5050/api/info 2>/dev/null || echo "")
    PRIMARY_IP=$(echo "$INFO" | grep -o '"primaryIp":"[^"]*' | cut -d'"' -f4)
    PRIMARY_IP=${PRIMARY_IP:-"127.0.0.1"}
    echo ""
    echo "============================================================"
    echo "   AirBridge is ALREADY running in the background!          "
    echo "============================================================"
    echo ""
    echo "  Host (This Mac):         http://localhost:5050"
    echo "  Office / Mobile Devices: http://${PRIMARY_IP}:5050"
    echo "  Save Directory:          ~/Downloads/AirBridge"
    echo ""
    echo "  Opening in your browser now..."
    echo "============================================================"
    echo ""
    open "http://localhost:5050" 2>/dev/null || true
    exit 0
fi

# Run server
node server/index.js

