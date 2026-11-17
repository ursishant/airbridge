#!/usr/bin/env bash

# Register AirBridge LaunchAgent background service
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"
mkdir -p ~/Library/LaunchAgents

NODE_BIN=$(which node || echo "/opt/homebrew/bin/node")

cat <<EOF > ~/Library/LaunchAgents/com.airbridge.server.plist
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.airbridge.server</string>
    <key>ProgramArguments</key>
    <array>
        <string>$NODE_BIN</string>
        <string>server/index.js</string>
    </array>
    <key>WorkingDirectory</key>
    <string>$DIR</string>
    <key>EnvironmentVariables</key>
    <dict>
        <key>PORT</key>
        <string>5050</string>
        <key>AUTO_OPEN</key>
        <string>false</string>
        <key>PATH</key>
        <string>/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin</string>
    </dict>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>StandardOutPath</key>
    <string>/tmp/airbridge.log</string>
    <key>StandardErrorPath</key>
    <string>/tmp/airbridge.log</string>
</dict>
</plist>
EOF

launchctl unload ~/Library/LaunchAgents/com.airbridge.server.plist 2>/dev/null || true
launchctl load ~/Library/LaunchAgents/com.airbridge.server.plist

# Wait briefly for daemon to initialize port
sleep 1.2

PRIMARY_IP=$(ipconfig getifaddr en0 2>/dev/null || echo "localhost")
if command -v curl &>/dev/null; then
    INFO=$(curl -s http://localhost:5050/api/info 2>/dev/null || echo "")
    if [ -n "$INFO" ]; then
        DETECTED_IP=$(echo "$INFO" | grep -o '"primaryIp":"[^"]*' | cut -d'"' -f4)
        if [ -n "$DETECTED_IP" ]; then
            PRIMARY_IP="$DETECTED_IP"
        fi
    fi
fi

echo ""
echo "============================================================"
echo "   AirBridge: Background Auto-Start Service Installed!      "
echo "============================================================"
echo ""
echo "  Host (This Mac):         http://localhost:5050"
echo "  Office / Mobile Devices: http://${PRIMARY_IP}:5050"
echo "  Save Directory:          ~/Downloads/AirBridge"
echo ""
echo "  [Status] Running silently in the background 24/7."
echo "  AirBridge starts automatically whenever this Mac boots."
echo "  Opening http://localhost:5050 in your browser..."
echo "============================================================"
echo ""

open "http://localhost:5050" 2>/dev/null || true

