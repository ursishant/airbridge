#!/usr/bin/env bash

# Unregister and stop AirBridge LaunchAgent background service
launchctl bootout gui/$(id -u)/com.airbridge.server 2>/dev/null || true
launchctl unload ~/Library/LaunchAgents/com.airbridge.server.plist 2>/dev/null || true
rm -f ~/Library/LaunchAgents/com.airbridge.server.plist

# Terminate any remaining server process on port 5050
PID=$(lsof -ti :5050 2>/dev/null || echo "")
if [ -n "$PID" ]; then
    kill -9 $PID 2>/dev/null || true
fi

echo "[Status] AirBridge background service stopped and uninstalled."

