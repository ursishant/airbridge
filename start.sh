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

# Run server
node server/index.js

