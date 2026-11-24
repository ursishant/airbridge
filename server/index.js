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
let compression = null;
try {
  compression = require('compression');
} catch (e) {}
const rateLimit = require('express-rate-limit');
const qrcodeTerminal = require('qrcode-terminal');

const { resolveUploadTarget } = require('./lib/uploadPaths');
const { StateStore } = require('./lib/stateStore');
const { CHUNKS_TEMP_DIR, startChunkReaper } = require('./lib/chunkReaper');
const {
  BOOT_HOST_SECRET,
  isHostRequest,
  createCorsOriginValidator,
  createRequireOfficeAuth,
  parseCookies,
  verifySessionToken,
} = require('./middleware/auth');

const { createInfoRouter } = require('./routes/info');
const { createOfficeRouter } = require('./routes/office');
const { createChatRouter } = require('./routes/chat');
const { createClipboardRouter } = require('./routes/clipboard');
const { createFilesRouter } = require('./routes/files');

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

// Initialize persistent state store with auto-migration from legacy UPLOADS_DIR
const stateStore = new StateStore({
  legacyUploadsDir: UPLOADS_DIR,
});

// Start startup + periodic 15-min chunk reaper (cleans abandoned chunks older than 2 hours)
startChunkReaper(CHUNKS_TEMP_DIR);

function getSanitizedHostname() {
  const raw = os.hostname() || 'AirBridge-Host';
  return raw.replace(/^[a-zA-Z0-9]+['’s_-]+MacBook/i, 'MacBook')
            .replace(/^[a-zA-Z0-9]+['’s_-]+PC/i, 'Windows-PC')
            .replace(/^[a-zA-Z0-9]+['’s_-]+Laptop/i, 'Laptop')
            .replace(/Ishants?[-_]?/gi, '');
}

function getSanitizedDownloadsDir() {
  return UPLOADS_DIR.replace(os.homedir(), '~');
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

  if (process.env.AIRBRIDGE_DEMO_IP) {
    preferredIp = process.env.AIRBRIDGE_DEMO_IP;
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

// Security: ONLY trust proxy if explicitly configured via environment variable
if (process.env.AIRBRIDGE_TRUST_PROXY === '1') {
  app.set('trust proxy', 1);
}

// Security: Strict CORS allowing bound host/LAN origins, blocking malicious external websites
app.use(cors({
  origin: createCorsOriginValidator(PORT),
  credentials: true,
}));

// Performance: Selective compression skipping binary transfer and files endpoints
if (compression) {
  app.use(compression({
    filter: (req, res) => {
      const url = req.originalUrl || req.url || '';
      if (url.includes('/api/files') || url.includes('/api/download') || url.includes('/api/upload')) {
        return false;
      }
      return compression.filter(req, res);
    }
  }));
}

// Cache-Control: no-cache for all API responses
app.use('/api', (req, res, next) => {
  res.setHeader('Cache-Control', 'no-cache');
  next();
});

// Generous rate limiter for general API endpoints (never throttles file transfers or local LAN traffic)
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 50000,
  standardHeaders: true,
  legacyHeaders: false,
  validate: { trustProxy: false },
  skip: (req) => {
    if (isHostRequest(req)) return true;
    const url = req.originalUrl || req.url || '';
    if (url.includes('/upload') || url.includes('/files') || url.includes('/download')) return true;
    return false;
  },
});

app.use('/api', apiLimiter);

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    let rawRel = file.originalname || '';
    if (req.body && req.body.paths) {
      try {
        const pathsArray = typeof req.body.paths === 'string' ? JSON.parse(req.body.paths) : req.body.paths;
        if (req._fileIndex === undefined) req._fileIndex = 0;
        if (Array.isArray(pathsArray) && pathsArray[req._fileIndex]) {
          rawRel = pathsArray[req._fileIndex];
        }
      } catch (e) {}
    }
    const target = resolveUploadTarget(UPLOADS_DIR, rawRel);
    file._cleanRelPath = target.cleanRel;

    try {
      if (!fs.existsSync(target.targetDir)) {
        fs.mkdirSync(target.targetDir, { recursive: true });
      }
      cb(null, target.targetDir);
    } catch (err) {
      cb(err, UPLOADS_DIR);
    }
  },
  filename: function (req, file, cb) {
    const target = resolveUploadTarget(UPLOADS_DIR, file._cleanRelPath || file.originalname || 'file');
    const targetDir = target.targetDir;

    let finalName = target.fileName;
    if (!target.isNested) {
      const destPath = path.join(targetDir, finalName);
      if (fs.existsSync(destPath)) {
        const ext = path.extname(finalName);
        const base = path.basename(finalName, ext);
        finalName = `${base}_${Date.now()}${ext}`;
      }
    }
    req._fileIndex = (req._fileIndex || 0) + 1;
    cb(null, finalName);
  },
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024 * 1024, // 10 GB limit for large video/files
    fieldSize: 100 * 1024 * 1024, // 100 MB limit for text fields/manifests
  },
});

// Configure disk storage for temporary chunk streaming in system temp directory
const chunkStorage = multer.diskStorage({
  destination: function (req, file, cb) {
    if (!fs.existsSync(CHUNKS_TEMP_DIR)) {
      try { fs.mkdirSync(CHUNKS_TEMP_DIR, { recursive: true }); } catch (e) {}
    }
    cb(null, CHUNKS_TEMP_DIR);
  },
  filename: function (req, file, cb) {
    const randomSuffix = crypto.randomBytes(16).toString('hex');
    cb(null, `chunk_${Date.now()}_${randomSuffix}.tmp`);
  },
});

const chunkUpload = multer({
  storage: chunkStorage,
  limits: { fileSize: 64 * 1024 * 1024 }, // 64MB max per individual chunk
});

// Create HTTP server with disabled timeouts for high-throughput LAN transfers
const server = http.createServer(app);
server.requestTimeout = 0;
server.headersTimeout = 0;
server.keepAliveTimeout = 300000;
server.timeout = 0;

// WebSocket Server (noServer: true so upgrade requests can be authenticated strictly)
const wss = new WebSocketServer({ noServer: true });
wss.on('error', (err) => {
  if (err && err.code !== 'EADDRINUSE') {
    console.error('[WebSocket Error]', err);
  }
});

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

// Coalescing broadcast for file uploads (1 broadcast/sec during bulk transfers)
let pendingUploadFiles = [];
let pendingUploadSender = '';
let uploadBroadcastTimer = null;

function broadcastFilesUploaded(files, sender) {
  pendingUploadFiles.push(...files);
  pendingUploadSender = sender || pendingUploadSender || 'Unknown Device';
  if (!uploadBroadcastTimer) {
    uploadBroadcastTimer = setTimeout(() => {
      const batch = pendingUploadFiles;
      const batchSender = pendingUploadSender;
      pendingUploadFiles = [];
      pendingUploadSender = '';
      uploadBroadcastTimer = null;
      broadcast({
        type: 'files_uploaded',
        files: batch,
        sender: batchSender,
      });
    }, 1000);
  }
}

function getUniqueDevices() {
  const deviceMap = new Map();
  for (const [ws, info] of connectedClients.entries()) {
    if (ws.readyState === WebSocket.OPEN && info) {
      const ip = (info.ip || 'local').replace(/^.*:/, '').trim().toLowerCase();
      const osKey = (info.os || 'unknown').trim().toLowerCase();
      const nameKey = (info.name || '').trim().toLowerCase();
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

// Enforce Session Validation on WebSocket Upgrade Requests
server.on('upgrade', (req, socket, head) => {
  const state = stateStore.getState();
  if (state.officeSecurity?.enabled) {
    const isHost = isHostRequest(req);
    let isAuthed = isHost;

    if (!isAuthed) {
      const cookies = parseCookies(req.headers.cookie);
      const sessionCookie = cookies['airbridge_session'];
      if (sessionCookie && verifySessionToken(sessionCookie)) {
        isAuthed = true;
      }
    }

    if (!isAuthed) {
      try {
        const urlObj = new URL(req.url, 'http://localhost');
        const queryPin = urlObj.searchParams.get('pin');
        if (queryPin && queryPin === state.officeSecurity.pin) {
          isAuthed = true;
        }
      } catch (_) {}
    }

    if (!isAuthed) {
      socket.write('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n');
      socket.destroy();
      return;
    }
  }

  wss.handleUpgrade(req, socket, head, (ws) => {
    wss.emit('connection', ws, req);
  });
});

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
  const state = stateStore.getState();
  let isAuthenticated = !state.officeSecurity?.enabled || isHostClient;

  if (!isAuthenticated) {
    const cookies = parseCookies(req.headers.cookie);
    if (cookies['airbridge_session'] && verifySessionToken(cookies['airbridge_session'])) {
      isAuthenticated = true;
    }
  }

  if (!isAuthenticated && queryPin && queryPin === state.officeSecurity?.pin) {
    isAuthenticated = true;
  }
  ws.isAuthenticated = isAuthenticated;
  ws.isHost = isHostClient;

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
    const s = stateStore.getState();
    targetWs.send(JSON.stringify({
      type: 'init',
      clientId,
      deviceInfo: initialDeviceInfo,
      devices: getUniqueDevices(),
      chatHistory: s.chatHistory.slice(-200),
      clipboardHistory: s.clipboardHistory.slice(-50),
      serverInfo: {
        downloadsDir: getSanitizedDownloadsDir(),
        hostname: getSanitizedHostname(),
        platform: process.platform,
        isWindows,
        isMac,
        isLinux,
      },
      isHost: ws.isHost,
      officeSecurity: {
        enabled: Boolean(s.officeSecurity?.enabled),
        pin: ws.isAuthenticated ? s.officeSecurity?.pin : undefined,
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
      const s = stateStore.getState();

      if (msg.type === 'authenticate') {
        const clientPin = (msg.pin || '').toString().trim();
        if (clientPin === s.officeSecurity?.pin) {
          ws.isAuthenticated = true;
          sendClientInit(ws);
          broadcastDevicesList();
        } else {
          ws.send(JSON.stringify({ type: 'auth_failed', error: 'Invalid PIN' }));
        }
        return;
      }

      if (!ws.isAuthenticated && s.officeSecurity?.enabled) {
        ws.send(JSON.stringify({ type: 'auth_required' }));
        return;
      }

      switch (msg.type) {
        case 'identify': {
          const current = connectedClients.get(ws) || {};
          const persistentId = msg.payload?.id || current.id || clientId;

          let clientBattery = msg.payload?.battery;
          if (!clientBattery && ws.isHost) {
            clientBattery = await getHostBattery();
          }
          const updatedDevice = {
            ...current,
            ...msg.payload,
            id: persistentId,
            battery: clientBattery || current.battery || null,
            lastSeen: Date.now(),
          };
          connectedClients.set(ws, updatedDevice);

          const existingIdx = s.knownDevices.findIndex(d =>
            d.id === persistentId || (d.ip === updatedDevice.ip && d.os === updatedDevice.os)
          );
          if (existingIdx >= 0) {
            s.knownDevices[existingIdx] = { ...s.knownDevices[existingIdx], ...updatedDevice };
          } else {
            s.knownDevices.push(updatedDevice);
          }
          if (s.knownDevices.length > 10) {
            s.knownDevices = s.knownDevices.slice(-10);
          }
          await stateStore.save();
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

          s.clipboardHistory = [clipItem, ...s.clipboardHistory.filter(c => c.id !== clipItem.id)].slice(0, 100);
          await stateStore.save();

          broadcast({
            type: 'clipboard_sync',
            payload: clipItem,
          }, ws);
          break;
        }

        case 'ring_device': {
          broadcast({
            type: 'ring_device',
            target: msg.target,
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

          s.chatHistory.push(chatMsg);
          if (s.chatHistory.length > 500) {
            s.chatHistory = s.chatHistory.slice(-500);
          }
          await stateStore.save();

          broadcast({
            type: 'chat_message',
            payload: chatMsg,
          });
          break;
        }

        case 'clear_chat': {
          s.chatHistory = [];
          await stateStore.save();
          broadcast({ type: 'chat_cleared' });
          break;
        }

        case 'clear_clipboard': {
          s.clipboardHistory = [];
          await stateStore.save();
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

// Periodic heartbeat
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
if (heartbeatInterval.unref) {
  heartbeatInterval.unref();
}

wss.on('close', () => {
  clearInterval(heartbeatInterval);
});

// Middleware for routes requiring Office PIN authorization
const requireOfficeAuth = createRequireOfficeAuth(() => stateStore.getState());

// Wire modular routes
app.use('/api', createInfoRouter({
  getNetworkIps,
  PORT,
  getSanitizedHostname,
  isWindows,
  isMac,
  isLinux,
  getSanitizedDownloadsDir,
  getUniqueDevices,
  stateStore,
  getHostBattery,
}));

app.use('/api/office', createOfficeRouter({
  stateStore,
  broadcast,
}));

app.use('/api/chat', requireOfficeAuth, createChatRouter({
  stateStore,
  broadcast,
}));

app.use('/api/clipboard', requireOfficeAuth, createClipboardRouter({
  stateStore,
  broadcast,
}));

app.use('/api', requireOfficeAuth, createFilesRouter({
  UPLOADS_DIR,
  CHUNKS_TEMP_DIR,
  upload,
  chunkUpload,
  broadcastFilesUploaded,
  broadcast,
  isMac,
  isWindows,
  isLinux,
}));

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

// Global Express error handler
app.use((err, req, res, next) => {
  if (err && (err.message === 'Request aborted' || err.code === 'ECONNRESET' || err.type === 'request.aborted')) {
    return res.status(499).end();
  }
  console.error('[Express Error]', err);
  if (!res.headersSent) {
    res.status(500).json({ error: err?.message || 'Server error' });
  }
});

// Graceful shutdown helper
function gracefulShutdown(exitCode = 1) {
  console.log('[AirBridge Server] Initiating clean shutdown...');
  try {
    server.close(() => {
      console.log('[AirBridge Server] HTTP server closed.');
      process.exit(exitCode);
    });
    // Force exit if close hangs
    setTimeout(() => {
      process.exit(exitCode);
    }, 3000).unref();
  } catch (_) {
    process.exit(exitCode);
  }
}

// Global safety guards: Do NOT swallow arbitrary errors and run in zombie state!
process.on('uncaughtException', (err) => {
  console.error('[AirBridge Server] Fatal Uncaught Exception:', err);
  gracefulShutdown(1);
});

process.on('unhandledRejection', (reason) => {
  console.error('[AirBridge Server] Fatal Unhandled Rejection:', reason);
  gracefulShutdown(1);
});

function failToStart(err) {
  if (err && err.code === 'EADDRINUSE') {
    const req = http.get(`http://localhost:${PORT}/api/info`, (res) => {
      let raw = '';
      res.on('data', (chunk) => { raw += chunk; });
      res.on('end', () => {
        try {
          const info = JSON.parse(raw);
          const localUrl = `http://localhost:${PORT}`;
          const mobileUrl = info.url || `http://${info.primaryIp}:${PORT}`;
          console.log('\n============================================================');
          console.log('   AirBridge is ALREADY running in the background!          ');
          console.log('============================================================');
          console.log(`\n  Host (${isMac ? 'macOS' : isWindows ? 'Windows' : 'Linux'}):     ${localUrl}`);
          console.log(`  Office / Mobile Devices: ${mobileUrl}`);
          console.log(`  Save Directory:          ${info.downloadsDir || '~/Downloads/AirBridge'}\n`);
          console.log('  Opening AirBridge in your browser now...\n');
          console.log('============================================================\n');

          if (isMac) {
            execFile('open', ['--', localUrl], () => {});
          } else if (isWindows) {
            execFile('rundll32.exe', ['url.dll,FileProtocolHandler', localUrl], () => {});
          } else if (isLinux) {
            execFile('xdg-open', [localUrl], () => {});
          }
          process.exit(0);
        } catch (e) {
          console.error(`\n[AirBridge Error] Port ${PORT} is already in use by another application.\n`);
          process.exit(1);
        }
      });
    });
    req.on('error', () => {
      console.error(`\n[AirBridge Error] Port ${PORT} is already in use by another application.`);
      console.error(`To use another port, run: PORT=5051 npm start\n`);
      process.exit(1);
    });
    return;
  }
  console.error(`[AirBridge Server] Failed to start on port ${PORT}:`, err && err.message ? err.message : err);
  process.exit(1);
}

server.on('error', failToStart);

// Start Server if invoked directly
if (require.main === module) {
  try {
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

      if (process.env.AUTO_OPEN !== 'false') {
        if (isWindows) {
          execFile('rundll32.exe', ['url.dll,FileProtocolHandler', localUrl], () => {});
        } else if (isMac) {
          execFile('open', ['--', localUrl], () => {});
        } else if (isLinux) {
          execFile('xdg-open', [localUrl], () => {});
        }
      }
    });
  } catch (err) {
    failToStart(err);
  }
}

module.exports = {
  app,
  server,
  stateStore,
  BOOT_HOST_SECRET,
  UPLOADS_DIR,
};
