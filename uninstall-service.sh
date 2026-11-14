#!/usr/bin/env bash

# Unregister AirBridge LaunchAgent background service
launchctl unload ~/Library/LaunchAgents/com.airbridge.server.plist 2>/dev/null || true
rm -f ~/Library/LaunchAgents/com.airbridge.server.plist
echo "[Status] AirBridge background auto-start service uninstalled."

