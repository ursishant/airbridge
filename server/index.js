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

// IP detection helper
function getNetworkIps() {
  const interfaces = os.networkInterfaces();
  const validIps = [];
  let preferredIp = 'localhost';

  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        validIps.push({
          interface: name,
          address: iface.address,
          isWifi: name.startsWith('en') || name.startsWith('wl'),
        });
        // Prefer en0 or wifi interface
        if (!preferredIp || preferredIp === 'localhost' || name === 'en0') {
          preferredIp = iface.address;
        }
      }
    }
  }

  return {
    primaryIp: preferredIp,
    allIps: validIps,
  };
}

// macOS Battery state helper
function getMacBattery() {
  return new Promise((resolve) => {
    if (os.platform() !== 'darwin') return resolve(null);
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

// Persistent Application State (Chat history, Clipboard history, Known paired devices)
const STATE_FILE = path.join(UPLOADS_DIR, '.airbridge_state.json');

let appState = {
  chatHistory: [],
  clipboardHistory: [],
  knownDevices: [],
};

// Load state from disk on startup
try {
  if (fs.existsSync(STATE_FILE)) {
    const raw = fs.readFileSync(STATE_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed.chatHistory)) appState.chatHistory = parsed.chatHistory;
    if (Array.isArray(parsed.clipboardHistory)) appState.clipboardHistory = parsed.clipboardHistory;
    if (Array.isArray(parsed.knownDevices)) appState.knownDevices = parsed.knownDevices;
    console.log(`[Storage] Loaded persistent state: ${appState.chatHistory.length} chats, ${appState.clipboardHistory.length} clipboard items.`);
  }
} catch (e) {
  console.log('Error reading state file, starting fresh:', e.message);
}

function saveAppState() {
  try {
    fs.writeFileSync(STATE_FILE, JSON.stringify(appState, null, 2), 'utf8');
  } catch (e) {
    console.error('Error saving persistent state:', e.message);
  }
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
  return Array.from(deviceMap.values()).slice(0, 5);
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
  try {
    const urlObj = new URL(req.url, 'http://localhost');
    queryId = urlObj.searchParams.get('id');
    queryName = urlObj.searchParams.get('name');
  } catch (e) {}

  const userAgent = req.headers['user-agent'] || '';
  const isAndroid = /android/i.test(userAgent);
  const isMac = /macintosh|mac os x/i.test(userAgent);

  const clientId = queryId || ('dev_' + Math.random().toString(36).substring(2, 9));
  const clientName = queryName || (isAndroid ? 'Android Device' : isMac ? 'MacBook' : 'Web Device');
  const ip = req.socket.remoteAddress ? req.socket.remoteAddress.replace(/^.*:/, '') : 'local';
  const osType = isAndroid ? 'Android' : isMac ? 'macOS' : 'Browser';

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

  // Send welcome handshake with full persistent chat and clipboard history
  ws.send(JSON.stringify({
    type: 'init',
    clientId,
    deviceInfo: initialDeviceInfo,
    devices: getUniqueDevices(),
    chatHistory: appState.chatHistory.slice(-200),
    clipboardHistory: appState.clipboardHistory.slice(-50),
    serverInfo: {
      downloadsDir: UPLOADS_DIR,
      hostname: os.hostname(),
      platform: os.platform(),
    },
  }));

  broadcastDevicesList();

  ws.on('message', async (raw) => {
    try {
      const msg = JSON.parse(raw.toString());

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

        case 'ping_mac': {
          // Play a native notification beep on macOS
          exec('afplay /System/Library/Sounds/Glass.aiff', (err) => {
            if (err) console.log('Ping sound err:', err.message);
          });
          broadcast({
            type: 'toast',
            message: `Ping received from ${initialDeviceInfo.name}!`,
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
  res.json({
    primaryIp: net.primaryIp,
    allIps: net.allIps,
    port: PORT,
    url: `http://${net.primaryIp}:${PORT}`,
    hostname: os.hostname(),
    os: 'macOS ' + os.release(),
    downloadsDir: UPLOADS_DIR,
    connectedCount: getUniqueDevices().length,
  });
});

// Battery endpoint for macOS host & web clients
app.get('/api/battery', async (req, res) => {
  const battery = await getMacBattery();
  res.json({ battery });
});

// Upload endpoint (supports full recursive folder beaming up to 1000 files)
app.post('/api/upload', upload.array('files', 1000), (req, res) => {
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
app.post('/api/upload-chunk', chunkUpload.single('chunk'), async (req, res) => {
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
app.post('/api/upload-snap', upload.single('file'), (req, res) => {
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

    // Play macOS camera shutter sound if available
    execFile('afplay', ['/System/Library/Components/CoreAudio.component/Contents/SharedSupport/SystemSounds/system/payment_success.caf'], (err) => {
      if (err) {
        execFile('afplay', ['/System/Library/Sounds/Ping.aiff'], () => {});
      }
    });

    broadcast({
      type: 'files_uploaded',
      files: [fileInfo],
      sender: req.body.sender || 'Android Camera',
    });

    res.json({ success: true, file: fileInfo });
  } catch (err) {
    console.error('[Snap Upload Error]', err);
    res.status(500).json({ error: err.message });
  }
});

// List files and folders in transfer directory
app.get('/api/files', (req, res) => {
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
app.get(/^\/api\/files\/(.*)/, (req, res) => {
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
app.get(/^\/api\/files-raw\/(.*)/, (req, res) => {
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
app.get(/^\/api\/download-folder\/(.*)/, (req, res) => {
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
app.get('/api/download-zip', (req, res) => {
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

app.delete(/^\/api\/files\/(.*)/, handleDeleteFileRequest);
app.delete('/api/files/{*filename}', handleDeleteFileRequest);
app.post('/api/files/delete', handleDeleteFileRequest);

// Open file or directory in macOS Finder
app.post('/api/open-in-finder', (req, res) => {
  const { filename } = req.body;
  const ROOT = path.resolve(UPLOADS_DIR);
  let targetPath = ROOT;

  if (filename && typeof filename === 'string') {
    const resolved = path.resolve(ROOT, filename);
    if (!resolved.startsWith(ROOT)) {
      return res.status(403).json({ error: 'Access denied: Invalid path' });
    }
    targetPath = resolved;
  }

  if (!fs.existsSync(targetPath)) {
    return res.status(404).json({ error: 'Target path does not exist' });
  }

  // Use execFile with arguments array to avoid shell injection
  const openArgs = targetPath === ROOT ? [targetPath] : ['-R', targetPath];
  execFile('open', openArgs, (err) => {
    if (err) {
      return res.status(500).json({ error: 'Failed to reveal in Finder' });
    }
    res.json({ success: true, opened: path.basename(targetPath) });
  });
});

// Open URL on macOS default browser
app.post('/api/open-url', (req, res) => {
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

  // Use execFile with arguments array to avoid shell injection
  execFile('open', ['--', parsedUrl.href], (err) => {
    if (err) return res.status(500).json({ error: 'Failed to open URL' });
    res.json({ success: true, opened: parsedUrl.href });
  });
});

// Get chat history
app.get('/api/chat', (req, res) => {
  res.json({ messages: appState.chatHistory });
});

// Clear chat history
app.post('/api/chat/clear', (req, res) => {
  appState.chatHistory = [];
  saveAppState();
  broadcast({ type: 'chat_cleared' });
  res.json({ success: true });
});

// Get clipboard history
app.get('/api/clipboard', (req, res) => {
  res.json({ items: appState.clipboardHistory });
});

// Clear clipboard history
app.post('/api/clipboard/clear', (req, res) => {
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

  console.log('\n============================================================');
  console.log('   AirBridge: macOS <-> Android Connection Server Running   ');
  console.log('============================================================');
  console.log(`\n  On your Mac:     ${localUrl}`);
  console.log(`  On your Android: ${primaryUrl}`);
  console.log(`  Save Directory:  ${UPLOADS_DIR}\n`);
  console.log('  Scan this QR Code with your Android camera to connect:\n');

  qrcodeTerminal.generate(primaryUrl, { small: true });

  console.log('\n============================================================\n');

  // Auto-open browser on Mac if launched interactively
  if (process.env.AUTO_OPEN !== 'false') {
    execFile('open', ['--', localUrl], (err) => {
      if (err) console.log('Notice: open URL automatically skipped:', err.message);
    });
  }
});
