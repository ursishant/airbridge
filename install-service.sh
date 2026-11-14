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
echo "[Success] AirBridge background auto-start service installed. Runs 24/7 silently."

