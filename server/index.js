const express = require('express');
const http = require('http');
const { WebSocketServer, WebSocket } = require('ws');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { exec, execFile } = require('child_process');
const crypto = require('crypto');
const multer = require('multer');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const { ZipArchive } = require('archiver');
const qrcodeTerminal = require('qrcode-terminal');

const PORT = process.env.PORT || 5050;

// Host OS detection
const isWindows = process.platform === 'win32';
const isMac = process.platform === 'darwin';
const isLinux = process.platform === 'linux';

// Resolve transfer directory in ~/Downloads/AirBridge or local fallback
const DOWNLOADS_DIR = path.join(os.homedir(), 'Downloads', 'AirBridge');
if (!fs.existsSync(DOWNLOADS_DIR)) {
  try {
    fs.mkdirSync(DOWNLOADS_DIR, { recursive: true });
  } catch (err) {
    console.error('Failed to create Downloads/AirBridge directory, falling back to ./uploads', err);
  }
}
const UPLOADS_DIR = fs.existsSync(DOWNLOADS_DIR) ? DOWNLOADS_DIR : path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

// IP detection helper with full Windows adapter & virtual interface filtering
function getNetworkIps() {
  const interfaces = os.networkInterfaces();
  const validIps = [];
  let preferredIp = 'localhost';

  for (const name of Object.keys(interfaces)) {
    const lowerName = name.toLowerCase();
    const isVirtual = /vethernet|virtual|vmnet|wsl|tailscale|zerotier|docker|loopback|tap|tun/i.test(lowerName);

    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        const isWifi = /^(en|wl|wi-fi|wireless)/i.test(lowerName);
        const isEthernet = /^(eth|ethernet|local area connection)/i.test(lowerName);

        validIps.push({
          interface: name,
          address: iface.address,
          isWifi,
          isEthernet,
          isVirtual,
        });

        // Preference order:
        // 1. Non-virtual Wi-Fi or Ethernet
        // 2. en0 on macOS or Wi-Fi on Windows
        // 3. Standard private LAN subnets (192.168.x.x, 10.x.x.x, 172.16-31.x.x)
        if (!isVirtual) {
          if (preferredIp === 'localhost' || name === 'en0' || isWifi || isEthernet) {
            preferredIp = iface.address;
          } else if (/^(192\.168\.|10\.|172\.(1[6-9]|2[0-9]|3[01])\.)/.test(iface.address) && preferredIp === 'localhost') {
            preferredIp = iface.address;
          }
        }
      }
    }
  }

  if (preferredIp === 'localhost' && validIps.length > 0) {
    preferredIp = validIps[0].address;
  }

  return {
    primaryIp: preferredIp,
    allIps: validIps,
  };
}

// Battery state helper for macOS
function getMacBattery() {
  return new Promise((resolve) => {
    if (!isMac) return resolve(null);
    exec('pmset -g batt', (err, stdout) => {
      if (err || !stdout) return resolve(null);
      const match = stdout.match(/(\d+)%/);
      const isDischarging = /discharging/i.test(stdout);
      const isCharging = !isDischarging && (/charging|AC Power/i.test(stdout));
      if (match) {
        resolve({
          level: parseInt(match[1], 10),
          charging: isCharging,
        });
      } else {
        resolve(null);
      }
    });
  });
}

// Battery state helper for Windows
function getWindowsBattery() {
  return new Promise((resolve) => {
    if (!isWindows) return resolve(null);
    execFile('powershell', [
      '-NoProfile',
      '-NonInteractive',
      '-Command',
      'Get-CimInstance -ClassName Win32_Battery | Select-Object -First 1 -Property EstimatedChargeRemaining, BatteryStatus | ConvertTo-Json'
    ], (err, stdout) => {
      if (err || !stdout) return resolve(null);
      try {
        const parsed = JSON.parse(stdout);
        const level = parseInt(parsed.EstimatedChargeRemaining, 10);
        const status = parseInt(parsed.BatteryStatus, 10);
        const charging = status === 2 || status === 6 || status === 7 || status === 8;
        if (!isNaN(level)) {
          return resolve({ level, charging });
        }
      } catch (e) {}
      resolve(null);
    });
  });
}

async function getHostBattery() {
  if (isMac) return await getMacBattery();
  if (isWindows) return await getWindowsBattery();
  return null;
}

// Native audio ping / notification
function playHostAlertSound() {
  if (isMac) {
    execFile('afplay', ['/System/Library/Sounds/Glass.aiff'], () => {});
  } else if (isWindows) {
    execFile('powershell', ['-NoProfile', '-Command', '[System.Console]::Beep(880, 250)'], () => {});
  }
}

const app = express();
app.use(cors());

// Global API rate limiter protecting all routes from DDoS and resource exhaustion
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 3000,
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(apiLimiter);

// Dedicated strict rate limiter for Office Room PIN verification to prevent brute-forcing
const pinAuthLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30, // maximum 30 attempts per 15 minutes
  message: { error: 'Too many PIN verification attempts. Please wait 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
});

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Configure multer for file uploads with folder structure preservation
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    let pathsArray = [];
    try {
      if (req.body && req.body.paths) {
        pathsArray = typeof req.body.paths === 'string' ? JSON.parse(req.body.paths) : req.body.paths;
      }
    } catch (e) {}

    if (req._fileIndex === undefined) req._fileIndex = 0;
    const currentRel = (Array.isArray(pathsArray) && pathsArray[req._fileIndex]) 
      ? pathsArray[req._fileIndex] 
      : (file.originalname || '');
    req._currentRelPath = currentRel;

    // Normalize slashes and strip any dangerous .. or absolute path prefixes
    let clean = currentRel.replace(/\\/g, '/').replace(/^(\.\.[\/\\])+/, '').replace(/^\/+/, '');
    const dirPart = path.dirname(clean);
    const targetDir = (dirPart && dirPart !== '.') ? path.join(UPLOADS_DIR, dirPart) : UPLOADS_DIR;

    try {
      if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, { recursive: true });
      }
      cb(null, targetDir);
    } catch (err) {
      cb(err, UPLOADS_DIR);
    }
  },
  filename: function (req, file, cb) {
    let clean = (req._currentRelPath || file.originalname || 'file').replace(/\\/g, '/');
    let fileName = path.basename(clean);
    const dirPart = path.dirname(clean);
    const targetDir = (dirPart && dirPart !== '.') ? path.join(UPLOADS_DIR, dirPart) : UPLOADS_DIR;

    const destPath = path.join(targetDir, fileName);
    if (fs.existsSync(destPath)) {
      const ext = path.extname(fileName);
      const base = path.basename(fileName, ext);
      fileName = `${base}_${Date.now()}${ext}`;
    }
    req._fileIndex = (req._fileIndex || 0) + 1;
    cb(null, fileName);
  },
});
const upload = multer({
  storage: storage,
  limits: { 
    fileSize: 10 * 1024 * 1024 * 1024, // 10 GB limit for large video/files
    fieldSize: 100 * 1024 * 1024, // 100 MB limit for text fields/manifests
  },
});

// Configure disk storage for temporary chunk streaming
const CHUNKS_TEMP_DIR = path.join(UPLOADS_DIR, '.chunks_temp');
if (!fs.existsSync(CHUNKS_TEMP_DIR)) {
  try {
    fs.mkdirSync(CHUNKS_TEMP_DIR, { recursive: true });
  } catch (e) {}
}

const chunkStorage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, CHUNKS_TEMP_DIR);
  },
  filename: function (req, file, cb) {
    const randomSuffix = crypto.randomBytes(16).toString('hex');
    cb(null, `chunk_${Date.now()}_${randomSuffix}.tmp`);
  },
});

const chunkUpload = multer({
  storage: chunkStorage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB max per individual chunk
});

// Create HTTP and WebSocket server with zero timeout for giant transfers
const server = http.createServer(app);
server.requestTimeout = 0; // Disable request timeout
server.headersTimeout = 0; // Disable headers timeout
server.keepAliveTimeout = 120000; // 2 minutes keep-alive
server.timeout = 0; // No socket timeout
const wss = new WebSocketServer({ server });

// Persistent Application State (Chat history, Clipboard history, Known paired devices, Office Room Security)
const STATE_FILE = path.join(UPLOADS_DIR, '.airbridge_state.json');

let appState = {
  chatHistory: [],
  clipboardHistory: [],
  knownDevices: [],
  officeSecurity: {
    enabled: false,
    pin: String(Math.floor(1000 + Math.random() * 9000)),
  },
};

// Load state from disk on startup
try {
  if (fs.existsSync(STATE_FILE)) {
    const raw = fs.readFileSync(STATE_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed.chatHistory)) appState.chatHistory = parsed.chatHistory;
    if (Array.isArray(parsed.clipboardHistory)) appState.clipboardHistory = parsed.clipboardHistory;
    if (Array.isArray(parsed.knownDevices)) appState.knownDevices = parsed.knownDevices;
    if (parsed.officeSecurity && typeof parsed.officeSecurity === 'object') {
      appState.officeSecurity.enabled = Boolean(parsed.officeSecurity.enabled);
    }
    console.log(`[Storage] Loaded persistent state: ${appState.chatHistory.length} chats, ${appState.clipboardHistory.length} clipboard items.`);
  }
} catch (e) {
  console.log('Error reading state file, starting fresh:', e.message);
}

function saveAppState() {
  try {
    const serialized = JSON.stringify({
      chatHistory: Array.isArray(appState.chatHistory) ? appState.chatHistory : [],
      clipboardHistory: Array.isArray(appState.clipboardHistory) ? appState.clipboardHistory : [],
      knownDevices: Array.isArray(appState.knownDevices) ? appState.knownDevices : [],
      officeSecurity: {
        enabled: Boolean(appState.officeSecurity?.enabled),
      },
    }, null, 2);
    fs.writeFileSync(STATE_FILE, serialized, 'utf8');
  } catch (e) {
    console.error('Error saving persistent state:', e.message);
  }
}

// Function to resolve all local IP addresses of the host machine
function getHostIpSet() {
  const hostIps = new Set([
    '127.0.0.1',
    '::1',
    'localhost',
    'local',
    '1',
    '0.0.0.0',
    '::',
  ]);
  try {
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
      for (const iface of interfaces[name]) {
        if (iface.address) {
          hostIps.add(iface.address.toLowerCase());
        }
      }
    }
  } catch (e) {}
  return hostIps;
}

function isHostRequest(req) {
  const rawRemote = (req.socket.remoteAddress || '').toLowerCase();
  const cleanRemote = rawRemote.replace(/^::ffff:/, '');
  const hostIps = getHostIpSet();

  if (hostIps.has(cleanRemote) || hostIps.has(rawRemote)) {
    return true;
  }
  if (req.hostname === 'localhost' || req.hostname === '127.0.0.1') {
    return true;
  }
  return false;
}

// Office Room Security Authorization helpers
function isAuthorizedRequest(req) {
  if (!appState.officeSecurity || !appState.officeSecurity.enabled) {
    return true;
  }

  // The host machine is always authorized
  if (isHostRequest(req)) {
    return true;
  }

  // Remote devices on shared Wi-Fi must supply the valid Room PIN
  const clientPin = (req.headers['x-airbridge-pin'] || req.query.pin || (req.body && req.body.pin) || '').toString().trim();
  return clientPin === appState.officeSecurity.pin && appState.officeSecurity.pin.length > 0;
}

function requireOfficeAuth(req, res, next) {
  if (isAuthorizedRequest(req)) {
    return next();
  }
  return res.status(401).json({
    error: 'Office Space is protected by Room PIN',
    officeSecurity: true,
    requiresPin: true,
  });
}

// Connected devices state (active live sockets)
const connectedClients = new Map();

// Helper to broadcast WebSocket messages
function broadcast(message, excludeWs = null) {
  const data = JSON.stringify(message);
  wss.clients.forEach((client) => {
    if (client !== excludeWs && client.readyState === WebSocket.OPEN) {
      client.send(data);
    }
  });
}

function getUniqueDevices() {
  const deviceMap = new Map();
  for (const [ws, info] of connectedClients.entries()) {
    if (ws.readyState === WebSocket.OPEN && info) {
      const ip = (info.ip || 'local').replace(/^.*:/, '').trim().toLowerCase();
      const osKey = (info.os || 'unknown').trim().toLowerCase();
      const nameKey = (info.name || '').trim().toLowerCase();
      // Unique physical key: IP + OS + Name
      const key = `${ip}_${osKey}_${nameKey}`;
      
      if (deviceMap.has(key)) {
        const existing = deviceMap.get(key);
        if (!existing.battery && info.battery) {
          deviceMap.set(key, info);
        }
      } else {
        deviceMap.set(key, info);
      }
    }
  }
  return Array.from(deviceMap.values()).slice(0, 50);
}

function broadcastDevicesList() {
  const devices = getUniqueDevices();
  broadcast({
    type: 'devices_update',
    devices,
  });
}

// WebSocket connection handling
wss.on('connection', (ws, req) => {
  ws.isAlive = true;
  ws.on('pong', () => {
    ws.isAlive = true;
  });

  let queryId = null;
  let queryName = null;
  let queryPin = null;
  try {
    const urlObj = new URL(req.url, 'http://localhost');
    queryId = urlObj.searchParams.get('id');
    queryName = urlObj.searchParams.get('name');
    queryPin = urlObj.searchParams.get('pin');
  } catch (e) {}

  const userAgent = req.headers['user-agent'] || '';
  const isAndroid = /android/i.test(userAgent);
  const isIos = /iphone|ipad|ipod/i.test(userAgent);
  const isMacClient = /macintosh|mac os x/i.test(userAgent) && !isIos;
  const isWindowsClient = /windows|win32|win64/i.test(userAgent);
  const isLinuxClient = /linux/i.test(userAgent) && !isAndroid;

  let osType = 'Browser';
  if (isWindowsClient) osType = 'Windows';
  else if (isMacClient) osType = 'macOS';
  else if (isAndroid) osType = 'Android';
  else if (isIos) osType = 'iOS';
  else if (isLinuxClient) osType = 'Linux';

  let defaultClientName = 'Office Device';
  if (isWindowsClient) defaultClientName = 'Windows PC';
  else if (isMacClient) defaultClientName = 'MacBook';
  else if (isAndroid) defaultClientName = 'Android Device';
  else if (isIos) defaultClientName = /ipad/i.test(userAgent) ? 'iPad' : 'iPhone';
  else if (isLinuxClient) defaultClientName = 'Linux PC';

  const clientId = queryId || ('dev_' + Math.random().toString(36).substring(2, 9));
  const clientName = queryName || defaultClientName;
  const ip = req.socket.remoteAddress ? req.socket.remoteAddress.replace(/^.*:/, '') : 'local';

  const isHostClient = isHostRequest(req);
  let isAuthenticated = !appState.officeSecurity?.enabled || isHostClient;
  if (!isAuthenticated && queryPin && queryPin === appState.officeSecurity?.pin) {
    isAuthenticated = true;
  }
  ws.isAuthenticated = isAuthenticated;
  ws.isHost = isHostClient;

  // Terminate any stale socket from the exact same device ID or physical IP+OS to prevent duplicates
  for (const [oldWs, oldInfo] of connectedClients.entries()) {
    if (oldWs !== ws) {
      const matchId = (queryId && oldInfo.id === queryId) || (oldInfo.id === clientId);
      const matchPhysical = (oldInfo.ip === ip && oldInfo.os === osType);
      if (matchId || matchPhysical) {
        connectedClients.delete(oldWs);
        try { oldWs.terminate(); } catch (e) {}
      }
    }
  }

  const initialDeviceInfo = {
    id: clientId,
    name: clientName,
    os: osType,
    ip,
    connectedAt: Date.now(),
    battery: null,
  };

  connectedClients.set(ws, initialDeviceInfo);

  function sendClientInit(targetWs) {
    targetWs.send(JSON.stringify({
      type: 'init',
      clientId,
      deviceInfo: initialDeviceInfo,
      devices: getUniqueDevices(),
      chatHistory: appState.chatHistory.slice(-200),
      clipboardHistory: appState.clipboardHistory.slice(-50),
      serverInfo: {
        downloadsDir: UPLOADS_DIR,
        hostname: os.hostname(),
        platform: process.platform,
        isWindows,
        isMac,
        isLinux,
      },
      isHost: ws.isHost,
      officeSecurity: {
        enabled: Boolean(appState.officeSecurity?.enabled),
        pin: ws.isAuthenticated ? appState.officeSecurity?.pin : undefined,
      },
    }));
  }

  if (isAuthenticated) {
    sendClientInit(ws);
    broadcastDevicesList();
  } else {
    ws.send(JSON.stringify({
      type: 'auth_required',
      officeSecurity: true,
    }));
  }

  ws.on('message', async (raw) => {
    try {
      const msg = JSON.parse(raw.toString());

      if (msg.type === 'authenticate') {
        const clientPin = (msg.pin || '').toString().trim();
        if (clientPin === appState.officeSecurity?.pin) {
          ws.isAuthenticated = true;
          sendClientInit(ws);
          broadcastDevicesList();
        } else {
          ws.send(JSON.stringify({ type: 'auth_failed', error: 'Invalid PIN' }));
        }
        return;
      }

      // Guard all messages behind authentication if Office Security is active
      if (!ws.isAuthenticated && appState.officeSecurity?.enabled) {
        ws.send(JSON.stringify({ type: 'auth_required' }));
        return;
      }

      switch (msg.type) {
        case 'identify': {
          // Client provides rich details (persistent device ID, device name, battery level, etc.)
          const current = connectedClients.get(ws) || {};
          const persistentId = msg.payload?.id || current.id || clientId;

          let clientBattery = msg.payload?.battery;
          if (!clientBattery && (msg.payload?.os === 'macOS' || isMac)) {
            clientBattery = await getMacBattery();
          }
          const updatedDevice = {
            ...current,
            ...msg.payload,
            id: persistentId,
            battery: clientBattery || current.battery || null,
            lastSeen: Date.now(),
          };
          connectedClients.set(ws, updatedDevice);

          // Track in known devices list (strictly capped and deduplicated)
          const existingIdx = appState.knownDevices.findIndex(d => 
            d.id === persistentId || (d.ip === updatedDevice.ip && d.os === updatedDevice.os)
          );
          if (existingIdx >= 0) {
            appState.knownDevices[existingIdx] = { ...appState.knownDevices[existingIdx], ...updatedDevice };
          } else {
            appState.knownDevices.push(updatedDevice);
          }
          if (appState.knownDevices.length > 10) {
            appState.knownDevices = appState.knownDevices.slice(-10);
          }
          saveAppState();
          broadcastDevicesList();
          break;
        }

        case 'clipboard_sync': {
          const text = msg.payload.text || '';
          const clipItem = {
            id: msg.payload.id || ('clip_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6)),
            text,
            from: msg.payload.from || initialDeviceInfo.name,
            timestamp: msg.payload.timestamp || Date.now(),
            isUrl: /^https?:\/\//i.test(text.trim()),
            isPhone: /^\+?[0-9\s-]{7,15}$/.test(text.trim()),
          };

          // Persist to server clipboard history
          appState.clipboardHistory = [clipItem, ...appState.clipboardHistory.filter(c => c.id !== clipItem.id)].slice(0, 100);
          saveAppState();

          // Broadcast clipboard update to all other devices
          broadcast({
            type: 'clipboard_sync',
            payload: clipItem,
          }, ws);
          break;
        }

        case 'ring_device': {
          // Ring Android or Mac
          broadcast({
            type: 'ring_device',
            target: msg.target, // 'android' | 'mac' | 'all'
            from: initialDeviceInfo.name,
            timestamp: Date.now(),
          });
          break;
        }

        case 'ping_host':
        case 'ping_mac': {
          playHostAlertSound();
          broadcast({
            type: 'toast',
            message: `Ping received from ${initialDeviceInfo.name}`,
          });
          break;
        }

        case 'camera_snap_ready': {
          broadcast({
            type: 'camera_snap_ready',
            payload: msg.payload,
          });
          break;
        }

        case 'send_message': {
          const chatMsg = {
            id: msg.payload.id || ('msg_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6)),
            text: msg.payload.text,
            from: msg.payload.from || initialDeviceInfo.name,
            fromId: msg.payload.fromId || clientId,
            timestamp: msg.payload.timestamp || Date.now(),
          };

          // Persist to server chat history
          appState.chatHistory.push(chatMsg);
          if (appState.chatHistory.length > 500) {
            appState.chatHistory = appState.chatHistory.slice(-500);
          }
          saveAppState();

          broadcast({
            type: 'chat_message',
            payload: chatMsg,
          });
          break;
        }

        case 'clear_chat': {
          appState.chatHistory = [];
          saveAppState();
          broadcast({ type: 'chat_cleared' });
          break;
        }

        case 'clear_clipboard': {
          appState.clipboardHistory = [];
          saveAppState();
          broadcast({ type: 'clipboard_cleared' });
          break;
        }

        default:
          broadcast(msg, ws);
      }
    } catch (err) {
      console.error('WebSocket message parsing error:', err);
    }
  });

  ws.on('close', () => {
    connectedClients.delete(ws);
    broadcastDevicesList();
  });
});

// Periodic heartbeat to automatically reap dead sockets every 20 seconds
const heartbeatInterval = setInterval(() => {
  for (const clientWs of connectedClients.keys()) {
    if (clientWs.isAlive === false || clientWs.readyState !== WebSocket.OPEN) {
      connectedClients.delete(clientWs);
      try { clientWs.terminate(); } catch (e) {}
      continue;
    }
    clientWs.isAlive = false;
    try { clientWs.ping(); } catch (e) {}
  }
  broadcastDevicesList();
}, 20000);

wss.on('close', () => {
  clearInterval(heartbeatInterval);
});

// Helper to get recursive directory statistics (total files & size)
function getDirectoryStats(dirPath) {
  let count = 0;
  let totalBytes = 0;
  function recurse(current) {
    try {
      const items = fs.readdirSync(current);
      for (const item of items) {
        if (item.startsWith('.')) continue;
        const full = path.join(current, item);
        const st = fs.statSync(full);
        if (st.isDirectory()) {
          recurse(full);
        } else if (st.isFile()) {
          count++;
          totalBytes += st.size;
        }
      }
    } catch (e) {}
  }
  recurse(dirPath);
  return { count, totalBytes };
}

// REST API Endpoints

// Server info & network discovery
app.get('/api/info', (req, res) => {
  const net = getNetworkIps();
  const isHost = isHostRequest(req);
  const isAuthed = isHost || isAuthorizedRequest(req);
  let osDisplay = 'macOS ' + os.release();
  if (isWindows) {
    osDisplay = 'Windows ' + (os.release().startsWith('10.0.2') ? '11' : '10');
  } else if (isLinux) {
    osDisplay = 'Linux ' + os.release();
  }

  res.json({
    primaryIp: net.primaryIp,
    allIps: net.allIps,
    port: PORT,
    url: `http://${net.primaryIp}:${PORT}`,
    hostname: os.hostname(),
    platform: process.platform,
    os: osDisplay,
    isWindows,
    isMac,
    isLinux,
    isHost,
    downloadsDir: UPLOADS_DIR,
    connectedCount: getUniqueDevices().length,
    officeSecurity: {
      enabled: Boolean(appState.officeSecurity?.enabled),
      requiresAuth: !isAuthed,
      pin: isAuthed ? appState.officeSecurity?.pin : undefined,
    },
  });
});

// Battery endpoint for macOS & Windows host & web clients
app.get('/api/battery', async (req, res) => {
  const battery = await getHostBattery();
  res.json({ battery });
});

// Verify Office Room PIN
app.post('/api/office/verify-pin', pinAuthLimiter, (req, res) => {
  const pin = (req.body && req.body.pin ? String(req.body.pin) : '').trim();
  if (!appState.officeSecurity?.enabled) {
    return res.json({ success: true, enabled: false });
  }
  if (pin === appState.officeSecurity.pin) {
    return res.json({ success: true, enabled: true });
  }
  return res.status(401).json({ error: 'Incorrect Room PIN', success: false });
});

// Configure Office Security (requires host or authed)
app.post('/api/office/configure', apiLimiter, requireOfficeAuth, (req, res) => {
  const { enabled, regenerate, pin } = req.body;
  if (typeof enabled === 'boolean') {
    appState.officeSecurity.enabled = enabled;
  }
  if (regenerate || !appState.officeSecurity.pin) {
    appState.officeSecurity.pin = Math.floor(1000 + Math.random() * 9000).toString();
  } else if (pin && typeof pin === 'string') {
    const raw = pin.trim().replace(/[^0-9]/g, '').slice(0, 8);
    const num = parseInt(raw, 10);
    if (!isNaN(num) && num >= 1000) {
      appState.officeSecurity.pin = String(num);
    }
  }
  saveAppState();
  broadcast({
    type: 'office_security_updated',
    officeSecurity: {
      enabled: appState.officeSecurity.enabled,
      pin: appState.officeSecurity.pin,
    },
  });
  res.json({ success: true, officeSecurity: appState.officeSecurity });
});

// Upload endpoint (supports full recursive folder beaming up to 1000 files)
app.post('/api/upload', apiLimiter, requireOfficeAuth, upload.array('files', 1000), (req, res) => {
  if (!req.files || req.files.length === 0) {
    return res.status(400).json({ error: 'No files uploaded' });
  }

  const uploadedFiles = req.files.map((file) => {
    const relFromUploads = path.relative(UPLOADS_DIR, file.path).replace(/\\/g, '/');
    const isInsideFolder = relFromUploads.includes('/');
    const topFolder = isInsideFolder ? relFromUploads.split('/')[0] : null;

    return {
      name: file.filename,
      originalName: file.originalname,
      relativePath: relFromUploads,
      folder: topFolder,
      size: file.size,
      mimetype: file.mimetype,
      path: `/api/files/${relFromUploads.split('/').map(encodeURIComponent).join('/')}`,
      fullPath: file.path,
      uploadedAt: Date.now(),
    };
  });

  // Broadcast WebSocket notification to all clients
  broadcast({
    type: 'files_uploaded',
    files: uploadedFiles,
    sender: req.body.sender || 'Unknown Device',
  });

  res.json({
    success: true,
    files: uploadedFiles,
  });
});

// Resumable Chunked Upload for arbitrarily large files (1GB, 5GB, 10GB+)
app.post('/api/upload-chunk', apiLimiter, requireOfficeAuth, chunkUpload.single('chunk'), async (req, res) => {
  const safeChunksDir = path.resolve(CHUNKS_TEMP_DIR);
  const chunkFileName = path.basename(req.file ? req.file.path : '');
  const safeChunkPath = path.resolve(safeChunksDir, chunkFileName);
  const isChunkValid = safeChunkPath.startsWith(safeChunksDir + path.sep);

  const cleanupChunk = () => {
    if (isChunkValid && fs.existsSync(safeChunkPath)) {
      try { fs.unlinkSync(safeChunkPath); } catch (e) {}
    }
  };

  try {
    const {
      fileId,
      chunkIndex,
      totalChunks,
      filename,
      relativePath,
      sender
    } = req.body;

    if (!req.file || !fileId || chunkIndex === undefined || totalChunks === undefined || !filename) {
      cleanupChunk();
      return res.status(400).json({ error: 'Missing chunk upload parameters' });
    }

    const cIndex = parseInt(chunkIndex, 10);
    const tChunks = parseInt(totalChunks, 10);

    const ROOT = path.resolve(UPLOADS_DIR);
    const resolvedFinalPath = path.resolve(ROOT, relativePath || filename);

    // Path traversal check
    if (!resolvedFinalPath.startsWith(ROOT)) {
      cleanupChunk();
      return res.status(403).json({ error: 'Access denied: Path traversal detected' });
    }

    const targetDir = path.dirname(resolvedFinalPath);
    if (!targetDir.startsWith(ROOT)) {
      cleanupChunk();
      return res.status(403).json({ error: 'Access denied: Invalid directory' });
    }

    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }

    const baseName = path.basename(resolvedFinalPath);
    const safeFileId = String(fileId).replace(/[^a-zA-Z0-9_-]/g, '');
    const resolvedTempPath = path.resolve(targetDir, `.${baseName}.${safeFileId}.part`);

    if (!resolvedTempPath.startsWith(ROOT)) {
      cleanupChunk();
      return res.status(403).json({ error: 'Access denied: Invalid temp path' });
    }

    // If chunk 0 and temp file already exists from an aborted session, remove it
    if (cIndex === 0 && fs.existsSync(resolvedTempPath)) {
      try { fs.unlinkSync(resolvedTempPath); } catch (e) {}
    }

    // Stream chunk from local disk-backed temporary file into partial assembly file
    if (isChunkValid) {
      await new Promise((resolve, reject) => {
        const readStream = fs.createReadStream(safeChunkPath);
        const writeStream = fs.createWriteStream(resolvedTempPath, { flags: 'a' });
        readStream.on('error', reject);
        writeStream.on('error', reject);
        writeStream.on('finish', () => {
          cleanupChunk();
          resolve();
        });
        readStream.pipe(writeStream);
      });
    }

    // If this is the last chunk, finalize the file!
    if (cIndex === tChunks - 1) {
      let finalDest = resolvedFinalPath;
      if (fs.existsSync(finalDest)) {
        const ext = path.extname(baseName);
        const base = path.basename(baseName, ext);
        finalDest = path.join(targetDir, `${base}_${Date.now()}${ext}`);
      }

      fs.renameSync(resolvedTempPath, finalDest);

      const stats = fs.statSync(finalDest);
      const relFromUploads = path.relative(UPLOADS_DIR, finalDest).replace(/\\/g, '/');
      const isInsideFolder = relFromUploads.includes('/');
      const topFolder = isInsideFolder ? relFromUploads.split('/')[0] : null;

      const fileInfo = {
        name: path.basename(finalDest),
        originalName: filename,
        relativePath: relFromUploads,
        folder: topFolder,
        size: stats.size,
        mimetype: req.file.mimetype || 'application/octet-stream',
        path: `/api/files/${relFromUploads.split('/').map(encodeURIComponent).join('/')}`,
        fullPath: finalDest,
        uploadedAt: Date.now(),
      };

      // Broadcast WebSocket notification to all clients
      broadcast({
        type: 'files_uploaded',
        files: [fileInfo],
        sender: sender || 'Unknown Device',
      });

      return res.json({
        success: true,
        completed: true,
        file: fileInfo,
      });
    }

    // Acknowledge intermediate chunk
    res.json({
      success: true,
      completed: false,
      chunkIndex: cIndex,
    });
  } catch (err) {
    cleanupChunk();
    console.error('Error in /api/upload-chunk:', err);
    res.status(500).json({ error: err.message });
  }
});

// Instant Camera Snap upload via multipart form-data (multer diskStorage)
app.post('/api/upload-snap', apiLimiter, requireOfficeAuth, upload.single('file'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No image uploaded' });
    }

    const fileInfo = {
      name: req.file.filename,
      originalName: req.file.originalname,
      size: req.file.size,
      mimetype: req.file.mimetype || 'image/jpeg',
      path: `/api/files/${encodeURIComponent(req.file.filename)}`,
      fullPath: req.file.path,
      uploadedAt: Date.now(),
      isSnap: true,
      note: req.body.note || '',
    };

    // Play camera snap sound if available
    if (isMac) {
      execFile('afplay', ['/System/Library/Components/CoreAudio.component/Contents/SharedSupport/SystemSounds/system/payment_success.caf'], (err) => {
        if (err) execFile('afplay', ['/System/Library/Sounds/Ping.aiff'], () => {});
      });
    }

    broadcast({
      type: 'files_uploaded',
      files: [fileInfo],
      sender: req.body.sender || 'Mobile Camera',
    });

    res.json({ success: true, file: fileInfo });
  } catch (err) {
    console.error('[Snap Upload Error]', err);
    res.status(500).json({ error: err.message });
  }
});

// List files and folders in transfer directory
app.get('/api/files', requireOfficeAuth, (req, res) => {
  fs.readdir(UPLOADS_DIR, (err, items) => {
    if (err) {
      return res.status(500).json({ error: 'Failed to read directory' });
    }

    const files = [];
    for (const item of items) {
      if (item.startsWith('.')) continue; // ignore hidden files like .DS_Store, .airbridge_state.json
      const fullPath = path.join(UPLOADS_DIR, item);
      try {
        const stats = fs.statSync(fullPath);
        if (stats.isDirectory()) {
          const dirStats = getDirectoryStats(fullPath);
          files.push({
            name: item,
            isDirectory: true,
            fileCount: dirStats.count,
            size: dirStats.totalBytes,
            modifiedAt: stats.mtimeMs,
            path: `/api/download-folder/${encodeURIComponent(item)}`,
          });
        } else if (stats.isFile()) {
          files.push({
            name: item,
            isDirectory: false,
            size: stats.size,
            modifiedAt: stats.mtimeMs,
            path: `/api/files/${encodeURIComponent(item)}`,
          });
        }
      } catch (e) {
        // file could have been removed concurrently
      }
    }

    // Sort newest first
    files.sort((a, b) => b.modifiedAt - a.modifiedAt);
    res.json({ files });
  });
});

// Download single file or file nested inside a folder with secure headers
app.get(/^\/api\/files\/(.*)/, requireOfficeAuth, (req, res) => {
  const reqPath = decodeURIComponent(req.params[0] || '');
  const ROOT = path.resolve(UPLOADS_DIR);
  const filePath = path.resolve(ROOT, reqPath);

  // Path traversal check
  if (!filePath.startsWith(ROOT)) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'File not found' });
  }

  const filename = path.basename(filePath);
  res.setHeader('Content-Type', 'application/octet-stream');
  res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"; filename*=UTF-8''${encodeURIComponent(filename)}`);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.download(filePath, filename);
});

// Stream or view raw file
app.get(/^\/api\/files-raw\/(.*)/, requireOfficeAuth, (req, res) => {
  const reqPath = decodeURIComponent(req.params[0] || '');
  const ROOT = path.resolve(UPLOADS_DIR);
  const filePath = path.resolve(ROOT, reqPath);

  if (!filePath.startsWith(ROOT)) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'File not found' });
  }

  res.sendFile(filePath);
});

// Download entire folder as a ZIP archive on demand with secure headers
app.get(/^\/api\/download-folder\/(.*)/, requireOfficeAuth, (req, res) => {
  const folderRelPath = decodeURIComponent(req.params[0] || '');
  const ROOT = path.resolve(UPLOADS_DIR);
  const folderPath = path.resolve(ROOT, folderRelPath);

  if (!folderPath.startsWith(ROOT) || !fs.existsSync(folderPath)) {
    return res.status(404).json({ error: 'Folder not found' });
  }

  const folderName = path.basename(folderPath);
  const archive = new ZipArchive({ zlib: { level: 6 } });

  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(folderName)}.zip"; filename*=UTF-8''${encodeURIComponent(folderName)}.zip`);
  res.setHeader('X-Content-Type-Options', 'nosniff');

  archive.on('error', (err) => {
    res.status(500).send({ error: err.message });
  });

  archive.pipe(res);
  archive.directory(folderPath, folderName);
  archive.finalize();
});

// Download all files as a ZIP archive with secure headers
app.get('/api/download-zip', requireOfficeAuth, (req, res) => {
  const archive = new ZipArchive({ zlib: { level: 6 } });
  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', 'attachment; filename="AirBridge_Files.zip"');
  res.setHeader('X-Content-Type-Options', 'nosniff');

  archive.on('error', (err) => {
    res.status(500).send({ error: err.message });
  });

  archive.pipe(res);
  archive.directory(UPLOADS_DIR, false);
  archive.finalize();
});

// Safe deletion function for files and entire folders
function deleteFileOrDirectory(targetName) {
  if (!targetName || typeof targetName !== 'string') {
    throw new Error('Invalid filename');
  }

  const ROOT = path.resolve(UPLOADS_DIR);
  const targetPath = path.resolve(ROOT, targetName);

  // Security: prevent path traversal outside UPLOADS_DIR
  if (!targetPath.startsWith(ROOT) || targetPath === ROOT) {
    throw new Error('Access denied: cannot delete outside root uploads folder');
  }

  if (!fs.existsSync(targetPath)) {
    return false;
  }

  // fs.rmSync removes both files and directories recursively on modern Node
  fs.rmSync(targetPath, { recursive: true, force: true });
  return true;
}

// Delete a file or directory (supports DELETE and POST with JSON body for maximum client compatibility)
const handleDeleteFileRequest = (req, res) => {
  if (!isAuthorizedRequest(req)) {
    return res.status(401).json({ error: 'Office Space is protected by Room PIN', officeSecurity: true });
  }

  let filename = '';
  if (req.body && req.body.filename) {
    filename = req.body.filename;
  } else if (req.params && req.params.filename) {
    const raw = req.params.filename;
    filename = Array.isArray(raw) ? raw.join('/') : raw;
  } else if (req.params && req.params[0]) {
    filename = decodeURIComponent(req.params[0]);
  }

  if (!filename || typeof filename !== 'string') {
    return res.status(400).json({ error: 'Filename is required' });
  }

  try {
    const deleted = deleteFileOrDirectory(filename);
    if (deleted) {
      console.log('[Vault] Successfully deleted file');
      broadcast({ type: 'file_deleted', filename });
      return res.json({ success: true, filename });
    }
    return res.status(404).json({ error: 'File or directory not found' });
  } catch (err) {
    console.error('[Vault Error] Failed to delete file');
    return res.status(500).json({ error: err.message || 'Failed to delete file or folder' });
  }
};

app.delete(/^\/api\/files\/(.*)/, apiLimiter, handleDeleteFileRequest);
app.delete('/api/files/{*filename}', apiLimiter, handleDeleteFileRequest);
app.post('/api/files/delete', apiLimiter, handleDeleteFileRequest);

// Reveal file or directory in Windows File Explorer, macOS Finder, or Linux File Manager
const handleRevealInFileManager = (req, res) => {
  const ROOT = path.resolve(UPLOADS_DIR);
  const rawFilename = (req.body && typeof req.body.filename === 'string') ? req.body.filename : '';
  const cleanFilename = path.normalize(rawFilename).replace(/^(\.\.[\/\\])+/, '');
  const targetPath = cleanFilename ? path.resolve(ROOT, cleanFilename) : ROOT;

  if (!targetPath.startsWith(ROOT)) {
    return res.status(403).json({ error: 'Access denied: Invalid path' });
  }

  if (!fs.existsSync(targetPath)) {
    return res.status(404).json({ error: 'Target path does not exist' });
  }

  const isDirectory = fs.statSync(targetPath).isDirectory();

  if (isWindows) {
    const explorerArgs = isDirectory ? [targetPath] : [`/select,${targetPath}`];
    execFile('explorer.exe', explorerArgs, (err) => {
      if (err && err.code !== 1) {
        return res.status(500).json({ error: 'Failed to reveal in File Explorer' });
      }
      res.json({ success: true, opened: path.basename(targetPath), platform: 'windows' });
    });
  } else if (isMac) {
    const openArgs = isDirectory ? [targetPath] : ['-R', targetPath];
    execFile('open', openArgs, (err) => {
      if (err) {
        return res.status(500).json({ error: 'Failed to reveal in Finder' });
      }
      res.json({ success: true, opened: path.basename(targetPath), platform: 'macos' });
    });
  } else {
    const dirToOpen = isDirectory ? targetPath : path.dirname(targetPath);
    execFile('xdg-open', [dirToOpen], (err) => {
      if (err) {
        return res.status(500).json({ error: 'Failed to reveal file' });
      }
      res.json({ success: true, opened: path.basename(targetPath), platform: 'linux' });
    });
  }
};

app.post('/api/open-in-finder', apiLimiter, requireOfficeAuth, handleRevealInFileManager);
app.post('/api/reveal-file', apiLimiter, requireOfficeAuth, handleRevealInFileManager);

// Open URL on host default browser
app.post('/api/open-url', apiLimiter, requireOfficeAuth, (req, res) => {
  const { url } = req.body;
  if (!url || typeof url !== 'string') return res.status(400).json({ error: 'No URL provided' });

  let parsedUrl;
  try {
    parsedUrl = new URL(url);
  } catch {
    return res.status(400).json({ error: 'Invalid URL format' });
  }

  // Restrict to safe web protocols
  if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
    return res.status(400).json({ error: 'Only HTTP and HTTPS URLs are permitted' });
  }

  if (isWindows) {
    execFile('rundll32.exe', ['url.dll,FileProtocolHandler', parsedUrl.href], (err) => {
      if (err) return res.status(500).json({ error: 'Failed to open URL' });
      res.json({ success: true, opened: parsedUrl.href, platform: 'windows' });
    });
  } else if (isMac) {
    execFile('open', ['--', parsedUrl.href], (err) => {
      if (err) return res.status(500).json({ error: 'Failed to open URL' });
      res.json({ success: true, opened: parsedUrl.href, platform: 'macos' });
    });
  } else {
    execFile('xdg-open', [parsedUrl.href], (err) => {
      if (err) return res.status(500).json({ error: 'Failed to open URL' });
      res.json({ success: true, opened: parsedUrl.href, platform: 'linux' });
    });
  }
});

// Get chat history
app.get('/api/chat', requireOfficeAuth, (req, res) => {
  res.json({ messages: appState.chatHistory });
});

// Clear chat history
app.post('/api/chat/clear', apiLimiter, requireOfficeAuth, (req, res) => {
  appState.chatHistory = [];
  saveAppState();
  broadcast({ type: 'chat_cleared' });
  res.json({ success: true });
});

// Get clipboard history
app.get('/api/clipboard', requireOfficeAuth, (req, res) => {
  res.json({ items: appState.clipboardHistory });
});

// Clear clipboard history
app.post('/api/clipboard/clear', apiLimiter, requireOfficeAuth, (req, res) => {
  appState.clipboardHistory = [];
  saveAppState();
  broadcast({ type: 'clipboard_cleared' });
  res.json({ success: true });
});

// Serve frontend in production (static build)
const publicDir = path.join(__dirname, 'public');
if (fs.existsSync(publicDir)) {
  app.use(express.static(publicDir));
  app.use((req, res, next) => {
    if (req.method === 'GET' && !req.path.startsWith('/api')) {
      return res.sendFile(path.join(publicDir, 'index.html'));
    }
    next();
  });
}

// Start Server
server.listen(PORT, '0.0.0.0', () => {
  const net = getNetworkIps();
  const primaryUrl = `http://${net.primaryIp}:${PORT}`;
  const localUrl = `http://localhost:${PORT}`;
  const hostPlatform = isWindows ? 'Windows' : isMac ? 'macOS' : 'Linux';

  console.log('\n============================================================');
  console.log('   AirBridge: Multi-Device LAN & Office Connection Running  ');
  console.log('============================================================');
  console.log(`\n  Host (${hostPlatform}):     ${localUrl}`);
  console.log(`  Office / Mobile Devices: ${primaryUrl}`);
  console.log(`  Save Directory:          ${UPLOADS_DIR}\n`);
  console.log('  Scan this QR Code with your phone camera to connect:\n');

  qrcodeTerminal.generate(primaryUrl, { small: true });

  console.log('\n============================================================\n');

  // Auto-open browser on host if launched interactively
  if (process.env.AUTO_OPEN !== 'false') {
    if (isWindows) {
      execFile('rundll32.exe', ['url.dll,FileProtocolHandler', localUrl], (err) => {
        if (err) console.log('Notice: auto-open browser skipped');
      });
    } else if (isMac) {
      execFile('open', ['--', localUrl], (err) => {
        if (err) console.log('Notice: auto-open browser skipped');
      });
    } else if (isLinux) {
      execFile('xdg-open', [localUrl], (err) => {
        if (err) console.log('Notice: auto-open browser skipped');
      });
    }
  }
});
