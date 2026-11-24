const express = require('express');
const path = require('path');
const fs = require('fs');
const { spawn, execFile } = require('child_process');
const { ZipArchive } = require('archiver');
const { computeFileSha256 } = require('../lib/chunkReaper');
const { isHostRequest, getClientDeviceId } = require('../middleware/auth');

function createFilesRouter(options) {
  const router = express.Router();
  const {
    UPLOADS_DIR,
    CHUNKS_TEMP_DIR,
    upload,
    chunkUpload,
    broadcastFilesUploaded,
    broadcast,
    isMac,
    isWindows,
    isLinux,
    stateStore,
  } = options;

  let cachedFilesList = null;
  let lastFilesListTime = 0;

  function invalidateCache() {
    cachedFilesList = null;
  }

  function getDirectoryStats(dirPath) {
    let count = 0;
    let totalBytes = 0;
    function recurse(current) {
      try {
        const items = fs.readdirSync(current);
        for (const item of items) {
          if (item === '.DS_Store' || item === 'Thumbs.db') continue;
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

  /**
   * Checks whether the requesting client is allowed to see or download this file.
   * Host is ALWAYS allowed.
   * If file is targeted, clientDeviceId must be in recipientIds list.
   * Checks download limits and expiration.
   */
  function isClientPermittedForFile(req, filename) {
    const isSimulatedPeer = Boolean(req.headers && req.headers['x-airbridge-simulated-peer']);
    if (isHostRequest(req) && !isSimulatedPeer) {
      return { permitted: true };
    }

    const state = stateStore.getState();
    const targetInfo = (state.targetedFiles || {})[filename];
    if (!targetInfo) {
      // Normal untargeted file: visible to anyone authorized in room
      return { permitted: true };
    }

    const clientDevId = getClientDeviceId(req);

    // Check expiration
    if (targetInfo.expiresAt && Date.now() > targetInfo.expiresAt) {
      return { permitted: false, reason: 'File link has expired' };
    }

    // Check max download limit
    if (targetInfo.maxDownloads && targetInfo.downloadCount >= targetInfo.maxDownloads) {
      return { permitted: false, reason: 'File download limit reached' };
    }

    // Check recipient whitelist
    if (Array.isArray(targetInfo.recipientIds) && targetInfo.recipientIds.length > 0) {
      if (!clientDevId || !targetInfo.recipientIds.includes(clientDevId)) {
        return { permitted: false, reason: 'This file is targeted to specific recipients only' };
      }
    }

    return { permitted: true, targetInfo };
  }

  // Upload endpoint (supports targeted recipient list and ephemeral limits)
  router.post('/upload', upload.array('files'), (req, res) => {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'No files uploaded' });
    }

    const state = stateStore.getState();
    if (!state.targetedFiles) state.targetedFiles = {};

    let targetRecipients = null;
    let maxDownloads = null;
    let expiresMinutes = null;

    if (req.body && req.body.recipients) {
      try {
        const parsed = typeof req.body.recipients === 'string' ? JSON.parse(req.body.recipients) : req.body.recipients;
        if (Array.isArray(parsed) && parsed.length > 0) {
          targetRecipients = parsed.map(String);
        }
      } catch (_) {}
    }

    if (req.body && req.body.maxDownloads) {
      const md = parseInt(req.body.maxDownloads, 10);
      if (!isNaN(md) && md > 0) maxDownloads = md;
    }

    if (req.body && req.body.expiresMinutes) {
      const em = parseInt(req.body.expiresMinutes, 10);
      if (!isNaN(em) && em > 0) expiresMinutes = em;
    }

    const uploadedFiles = req.files.map((file) => {
      const relFromUploads = path.relative(UPLOADS_DIR, file.path).replace(/\\/g, '/');
      const isInsideFolder = relFromUploads.includes('/');
      const topFolder = isInsideFolder ? relFromUploads.split('/')[0] : null;

      if (targetRecipients || maxDownloads || expiresMinutes) {
        state.targetedFiles[file.filename] = {
          recipientIds: targetRecipients || [],
          maxDownloads: maxDownloads || null,
          downloadCount: 0,
          expiresAt: expiresMinutes ? Date.now() + expiresMinutes * 60 * 1000 : null,
        };
      }

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
        targeted: Boolean(targetRecipients),
      };
    });

    stateStore.save();
    invalidateCache();

    // Broadcast WebSocket notification only to targeted recipients (or everyone if untargeted)
    broadcastFilesUploaded(uploadedFiles, req.body.sender || 'Unknown Device');

    res.json({
      success: true,
      files: uploadedFiles,
    });
  });

  // Resumable Chunked Upload for large files (sequential)
  router.post('/upload-chunk', chunkUpload.single('chunk'), async (req, res) => {
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
        sender,
        expectedSha256,
        recipients,
      } = req.body;

      if (!req.file || !fileId || chunkIndex === undefined || totalChunks === undefined || !filename) {
        cleanupChunk();
        return res.status(400).json({ error: 'Missing chunk upload parameters' });
      }

      const cIndex = parseInt(chunkIndex, 10);
      const tChunks = parseInt(totalChunks, 10);

      const ROOT = path.resolve(UPLOADS_DIR);
      const rawTarget = String(relativePath || filename);
      const cleanRel = path.normalize(rawTarget).replace(/\\/g, '/').replace(/^(\.\.[\/\\])+/, '').replace(/^\/+/, '');
      const resolvedFinalPath = path.resolve(ROOT, cleanRel);
      const rel = path.relative(ROOT, resolvedFinalPath);

      if (!rel || rel.startsWith('..') || path.isAbsolute(rel) || !resolvedFinalPath.startsWith(ROOT + path.sep)) {
        cleanupChunk();
        return res.status(403).json({ error: 'Access denied: Path traversal detected' });
      }

      const targetDir = path.dirname(resolvedFinalPath);
      const dirRel = path.relative(ROOT, targetDir);
      if (targetDir !== ROOT && (!dirRel || dirRel.startsWith('..') || path.isAbsolute(dirRel) || !targetDir.startsWith(ROOT + path.sep))) {
        cleanupChunk();
        return res.status(403).json({ error: 'Access denied: Invalid directory' });
      }

      fs.mkdirSync(targetDir, { recursive: true });

      const baseName = path.basename(resolvedFinalPath);
      const safeFileId = String(fileId).replace(/[^a-zA-Z0-9_-]/g, '');
      const resolvedTempPath = path.resolve(targetDir, `.${baseName}.${safeFileId}.part`);

      if (!resolvedTempPath.startsWith(ROOT + path.sep)) {
        cleanupChunk();
        return res.status(403).json({ error: 'Access denied: Invalid temp path' });
      }

      if (cIndex === 0 && fs.existsSync(resolvedTempPath)) {
        try { fs.unlinkSync(resolvedTempPath); } catch (e) {}
      }

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

      if (cIndex === tChunks - 1) {
        let finalDest = resolvedFinalPath;
        if (fs.existsSync(finalDest)) {
          const ext = path.extname(baseName);
          const base = path.basename(baseName, ext);
          finalDest = path.join(targetDir, `${base}_${Date.now()}${ext}`);
        }

        fs.renameSync(resolvedTempPath, finalDest);

        if (expectedSha256 && typeof expectedSha256 === 'string') {
          const actualSha256 = await computeFileSha256(finalDest);
          if (actualSha256.toLowerCase() !== expectedSha256.trim().toLowerCase()) {
            try { fs.unlinkSync(finalDest); } catch (_) {}
            return res.status(400).json({ error: 'Checksum mismatch: file corrupted in transit' });
          }
        }

        const stats = fs.statSync(finalDest);
        const relFromUploads = path.relative(UPLOADS_DIR, finalDest).replace(/\\/g, '/');
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

        invalidateCache();
        broadcastFilesUploaded([fileInfo], sender || 'Unknown Device');

        return res.json({
          success: true,
          completed: true,
          file: fileInfo,
        });
      }

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

  // Parallel Chunk Upload
  const activeTransfers = new Map();

  setInterval(() => {
    const now = Date.now();
    for (const [id, t] of activeTransfers.entries()) {
      if (now - t.lastActivity > 10 * 60 * 1000) {
        try { if (t.fd) fs.closeSync(t.fd); } catch (e) {}
        try { if (fs.existsSync(t.partPath)) fs.unlinkSync(t.partPath); } catch (e) {}
        activeTransfers.delete(id);
      }
    }
  }, 60000).unref?.();

  router.post('/upload-parallel', chunkUpload.single('chunk'), async (req, res) => {
    const safeChunksDir = path.resolve(CHUNKS_TEMP_DIR);
    const chunkFileName = path.basename(req.file ? req.file.path : '');
    const safeChunkPath = path.resolve(safeChunksDir, chunkFileName);
    const isChunkValid = chunkFileName.length > 0 && safeChunkPath.startsWith(safeChunksDir + path.sep);

    const cleanupTempChunk = () => {
      if (isChunkValid && fs.existsSync(safeChunkPath)) {
        try { fs.unlinkSync(safeChunkPath); } catch (e) {}
      }
    };

    try {
      const {
        fileId,
        chunkIndex,
        totalChunks,
        chunkSize,
        filename,
        relativePath,
        sender,
        fileSize,
        expectedSha256,
      } = req.body;

      if (!req.file || !fileId || chunkIndex === undefined || totalChunks === undefined || !filename || !isChunkValid) {
        cleanupTempChunk();
        return res.status(400).json({ error: 'Missing or invalid parallel chunk upload parameters' });
      }

      const cIndex = parseInt(chunkIndex, 10);
      const tChunks = parseInt(totalChunks, 10);
      const cSize = parseInt(chunkSize, 10) || (16 * 1024 * 1024);
      const safeFileId = String(fileId).replace(/[^a-zA-Z0-9_-]/g, '');
      const position = cIndex * cSize;

      let transfer = activeTransfers.get(safeFileId);
      if (!transfer) {
        const ROOT = path.resolve(UPLOADS_DIR);
        const rawTarget = String(relativePath || filename);
        const cleanRel = path.normalize(rawTarget).replace(/\\/g, '/').replace(/^(\.\.[\/\\])+/, '').replace(/^\/+/, '');
        const resolvedFinalPath = path.resolve(ROOT, cleanRel);
        const rel = path.relative(ROOT, resolvedFinalPath);

        if (!rel || rel.startsWith('..') || path.isAbsolute(rel) || !resolvedFinalPath.startsWith(ROOT + path.sep)) {
          cleanupTempChunk();
          return res.status(403).json({ error: 'Access denied: Path traversal detected' });
        }

        const targetDir = path.dirname(resolvedFinalPath);
        const dirRel = path.relative(ROOT, targetDir);
        if (targetDir !== ROOT && (!dirRel || dirRel.startsWith('..') || path.isAbsolute(dirRel) || !targetDir.startsWith(ROOT + path.sep))) {
          cleanupTempChunk();
          return res.status(403).json({ error: 'Access denied: Invalid directory' });
        }

        fs.mkdirSync(targetDir, { recursive: true });

        const baseName = path.basename(resolvedFinalPath);
        const partPath = path.resolve(targetDir, `.${baseName}.${safeFileId}.part`);
        const partRel = path.relative(ROOT, partPath);
        if (!partRel || partRel.startsWith('..') || path.isAbsolute(partRel) || !partPath.startsWith(ROOT + path.sep)) {
          cleanupTempChunk();
          return res.status(403).json({ error: 'Access denied: Invalid temp path' });
        }

        const fd = fs.openSync(partPath, fs.constants.O_RDWR | fs.constants.O_CREAT);

        transfer = {
          fd,
          targetDir,
          baseName,
          partPath,
          resolvedFinalPath,
          received: new Set(),
          totalChunks: tChunks,
          filename,
          relativePath: cleanRel,
          sender: sender || 'Unknown Device',
          fileSize: parseInt(fileSize, 10) || 0,
          expectedSha256: expectedSha256 ? String(expectedSha256).trim() : null,
          lastActivity: Date.now(),
        };
        activeTransfers.set(safeFileId, transfer);
      }

      const chunkBuf = fs.readFileSync(safeChunkPath);
      await new Promise((resolve, reject) => {
        fs.write(transfer.fd, chunkBuf, 0, chunkBuf.length, position, (err) => {
          if (err) return reject(err);
          resolve();
        });
      });
      cleanupTempChunk();

      transfer.received.add(cIndex);
      transfer.lastActivity = Date.now();

      if (transfer.received.size >= tChunks) {
        try {
          fs.closeSync(transfer.fd);
        } catch (e) {
          console.warn('Error closing fd on completion:', e);
        }
        activeTransfers.delete(safeFileId);

        let finalDest = transfer.resolvedFinalPath;
        const isInsideFolder = transfer.relativePath.includes('/');
        if (fs.existsSync(finalDest)) {
          if (!isInsideFolder) {
            const ext = path.extname(transfer.baseName);
            const base = path.basename(transfer.baseName, ext);
            finalDest = path.join(transfer.targetDir, `${base}_${Date.now()}${ext}`);
          } else {
            try { fs.unlinkSync(finalDest); } catch (e) {}
          }
        }

        fs.renameSync(transfer.partPath, finalDest);

        if (transfer.expectedSha256) {
          const actualSha256 = await computeFileSha256(finalDest);
          if (actualSha256.toLowerCase() !== transfer.expectedSha256.toLowerCase()) {
            try { fs.unlinkSync(finalDest); } catch (_) {}
            return res.status(400).json({ error: 'Checksum mismatch: file corrupted in transit' });
          }
        }

        const stats = fs.statSync(finalDest);
        const relFromUploads = path.relative(UPLOADS_DIR, finalDest).replace(/\\/g, '/');
        const topFolder = isInsideFolder ? relFromUploads.split('/')[0] : null;

        const fileInfo = {
          name: path.basename(finalDest),
          originalName: transfer.filename,
          relativePath: relFromUploads,
          folder: topFolder,
          size: stats.size,
          mimetype: req.file.mimetype || 'application/octet-stream',
          path: `/api/files/${relFromUploads.split('/').map(encodeURIComponent).join('/')}`,
          fullPath: finalDest,
          uploadedAt: Date.now(),
        };

        invalidateCache();
        broadcastFilesUploaded([fileInfo], transfer.sender);

        return res.json({
          success: true,
          completed: true,
          file: fileInfo,
        });
      }

      res.json({
        success: true,
        completed: false,
        chunkIndex: cIndex,
        receivedCount: transfer.received.size,
        totalChunks: tChunks,
      });
    } catch (err) {
      cleanupTempChunk();
      console.error('Error in /api/upload-parallel:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // Instant Camera Snap
  router.post('/upload-snap', upload.single('file'), (req, res) => {
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

      if (isMac) {
        execFile('afplay', ['/System/Library/Components/CoreAudio.component/Contents/SharedSupport/SystemSounds/system/payment_success.caf'], (err) => {
          if (err) execFile('afplay', ['/System/Library/Sounds/Ping.aiff'], () => {});
        });
      }

      invalidateCache();
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

  // List files (filters targeted files for unauthorized peers)
  router.get('/files', (req, res) => {
    const isHost = isHostRequest(req);
    const now = Date.now();

    // Cache only applies to host views to prevent leakage across peers
    if (isHost && cachedFilesList && (now - lastFilesListTime < 2000)) {
      return res.json({ files: cachedFilesList });
    }

    fs.readdir(UPLOADS_DIR, (err, items) => {
      if (err) {
        return res.status(500).json({ error: 'Failed to read directory' });
      }

      const files = [];
      for (const item of items) {
        if (item.startsWith('.')) continue;

        // Security: Filter targeted files if client is not recipient or host
        const access = isClientPermittedForFile(req, item);
        if (!access.permitted) {
          continue;
        }

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
        } catch (e) {}
      }

      files.sort((a, b) => b.modifiedAt - a.modifiedAt);
      if (isHost) {
        cachedFilesList = files;
        lastFilesListTime = now;
      }
      res.json({ files });
    });
  });

  // Download single file with Range support & targeted check
  router.get(/^\/files\/(.*)/, (req, res) => {
    const reqPath = decodeURIComponent(req.params[0] || '');
    const ROOT = path.resolve(UPLOADS_DIR);
    const cleanPath = path.normalize(reqPath).replace(/\\/g, '/').replace(/^(\.\.[\/\\])+/, '').replace(/^\/+/, '');
    const filePath = path.resolve(ROOT, cleanPath);
    const rel = path.relative(ROOT, filePath);

    if (!rel || rel.startsWith('..') || path.isAbsolute(rel) || !filePath.startsWith(ROOT + path.sep)) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'File not found' });
    }

    const filename = path.basename(filePath);

    // Security: Check targeted file permissions
    const access = isClientPermittedForFile(req, filename);
    if (!access.permitted) {
      return res.status(403).json({ error: access.reason || 'Forbidden' });
    }

    const stat = fs.statSync(filePath);
    if (!stat.isFile()) {
      return res.status(400).json({ error: 'Not a file' });
    }

    // Increment download count if targeted
    if (access.targetInfo) {
      access.targetInfo.downloadCount = (access.targetInfo.downloadCount || 0) + 1;
      stateStore.save();
    }

    const fileSize = stat.size;
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"; filename*=UTF-8''${encodeURIComponent(filename)}`);
    res.setHeader('Cache-Control', 'private, max-age=86400, no-transform');
    res.setHeader('X-Content-Type-Options', 'nosniff');

    const rangeHeader = req.headers.range;
    if (rangeHeader) {
      const match = rangeHeader.match(/bytes=(\d+)-(\d*)/);
      if (!match) {
        res.setHeader('Content-Range', `bytes */${fileSize}`);
        return res.status(416).json({ error: 'Invalid Range header' });
      }

      const start = parseInt(match[1], 10);
      const end = match[2] ? parseInt(match[2], 10) : fileSize - 1;

      if (start >= fileSize || end >= fileSize || start > end) {
        res.setHeader('Content-Range', `bytes */${fileSize}`);
        return res.status(416).json({ error: 'Range Not Satisfiable' });
      }

      const contentLength = end - start + 1;
      res.status(206);
      res.setHeader('Content-Range', `bytes ${start}-${end}/${fileSize}`);
      res.setHeader('Content-Length', contentLength);

      const stream = fs.createReadStream(filePath, { start, end, highWaterMark: 4 * 1024 * 1024 });
      stream.pipe(res);
    } else {
      res.setHeader('Content-Length', fileSize);
      const stream = fs.createReadStream(filePath, { highWaterMark: 4 * 1024 * 1024 });
      stream.pipe(res);
    }
  });

  // Ranged File Download
  router.get(/^\/files-ranged\/(.*)/, (req, res) => {
    const reqPath = decodeURIComponent(req.params[0] || '');
    const ROOT = path.resolve(UPLOADS_DIR);
    const cleanPath = path.normalize(reqPath).replace(/\\/g, '/').replace(/^(\.\.[\/\\])+/, '').replace(/^\/+/, '');
    const filePath = path.resolve(ROOT, cleanPath);
    const rel = path.relative(ROOT, filePath);

    if (!rel || rel.startsWith('..') || path.isAbsolute(rel) || !filePath.startsWith(ROOT + path.sep)) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'File not found' });
    }

    const filename = path.basename(filePath);
    const access = isClientPermittedForFile(req, filename);
    if (!access.permitted) {
      return res.status(403).json({ error: access.reason || 'Forbidden' });
    }

    const stat = fs.statSync(filePath);
    if (!stat.isFile()) {
      return res.status(400).json({ error: 'Not a file' });
    }

    const fileSize = stat.size;

    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"; filename*=UTF-8''${encodeURIComponent(filename)}`);
    res.setHeader('Cache-Control', 'private, max-age=86400, no-transform');
    res.setHeader('X-Content-Type-Options', 'nosniff');

    const rangeHeader = req.headers.range;
    if (rangeHeader) {
      const match = rangeHeader.match(/bytes=(\d+)-(\d*)/);
      if (!match) {
        res.setHeader('Content-Range', `bytes */${fileSize}`);
        return res.status(416).json({ error: 'Invalid Range header' });
      }

      const start = parseInt(match[1], 10);
      const end = match[2] ? parseInt(match[2], 10) : fileSize - 1;

      if (start >= fileSize || end >= fileSize || start > end) {
        res.setHeader('Content-Range', `bytes */${fileSize}`);
        return res.status(416).json({ error: 'Range Not Satisfiable' });
      }

      const contentLength = end - start + 1;
      res.status(206);
      res.setHeader('Content-Range', `bytes ${start}-${end}/${fileSize}`);
      res.setHeader('Content-Length', contentLength);
      res.setHeader('Content-Type', 'application/octet-stream');

      const stream = fs.createReadStream(filePath, { start, end, highWaterMark: 4 * 1024 * 1024 });
      stream.pipe(res);
    } else {
      res.setHeader('Content-Length', fileSize);
      res.setHeader('Content-Type', 'application/octet-stream');
      const stream = fs.createReadStream(filePath, { highWaterMark: 4 * 1024 * 1024 });
      stream.pipe(res);
    }
  });

  // Raw file view
  router.get(/^\/files-raw\/(.*)/, (req, res) => {
    const reqPath = decodeURIComponent(req.params[0] || '');
    const ROOT = path.resolve(UPLOADS_DIR);
    const cleanPath = path.normalize(reqPath).replace(/\\/g, '/').replace(/^(\.\.[\/\\])+/, '').replace(/^\/+/, '');
    const filePath = path.resolve(ROOT, cleanPath);
    const rel = path.relative(ROOT, filePath);

    if (!rel || rel.startsWith('..') || path.isAbsolute(rel) || !filePath.startsWith(ROOT + path.sep)) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'File not found' });
    }

    const filename = path.basename(filePath);
    const access = isClientPermittedForFile(req, filename);
    if (!access.permitted) {
      return res.status(403).json({ error: access.reason || 'Forbidden' });
    }

    res.sendFile(filePath);
  });

  // Download folder as ZIP
  router.get(/^\/download-folder\/(.*)/, (req, res) => {
    const folderRelPath = decodeURIComponent(req.params[0] || '');
    const ROOT = path.resolve(UPLOADS_DIR);
    const cleanRel = path.normalize(folderRelPath).replace(/\\/g, '/').replace(/^(\.\.[\/\\])+/, '').replace(/^\/+/, '');
    const folderPath = path.resolve(ROOT, cleanRel);
    const rel = path.relative(ROOT, folderPath);

    if (!rel || rel.startsWith('..') || path.isAbsolute(rel) || !folderPath.startsWith(ROOT + path.sep)) {
      return res.status(403).json({ error: 'Access denied: Invalid folder path' });
    }

    if (!fs.existsSync(folderPath)) {
      return res.status(404).json({ error: 'Folder not found' });
    }

    const stat = fs.statSync(folderPath);
    if (!stat.isDirectory()) {
      return res.status(400).json({ error: 'Not a directory' });
    }

    const folderName = path.basename(folderPath);
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(folderName)}.zip"; filename*=UTF-8''${encodeURIComponent(folderName)}.zip`);
    res.setHeader('Cache-Control', 'private, max-age=86400, no-transform');
    res.setHeader('X-Content-Type-Options', 'nosniff');

    const zipBinary = fs.existsSync('/usr/bin/zip') ? '/usr/bin/zip' : (fs.existsSync('/usr/local/bin/zip') ? '/usr/local/bin/zip' : null);

    if (zipBinary) {
      const parentDir = path.dirname(folderPath);
      const targetDirName = path.basename(folderPath);

      const zipProcess = spawn(zipBinary, ['-0', '-q', '-r', '-', targetDirName], {
        cwd: parentDir,
        stdio: ['ignore', 'pipe', 'pipe']
      });

      zipProcess.stdout.pipe(res);

      req.on('close', () => {
        if (!zipProcess.killed) {
          try { zipProcess.kill('SIGTERM'); } catch (e) {}
        }
      });

      zipProcess.on('error', (err) => {
        console.error('[Native Zip Error]:', err);
        if (!res.headersSent) {
          res.status(500).json({ error: 'Failed to stream folder archive' });
        }
      });
    } else {
      const archive = new ZipArchive({ zlib: { level: 0 }, highWaterMark: 4 * 1024 * 1024 });
      archive.on('error', (err) => {
        if (!res.headersSent) res.status(500).send({ error: err.message });
      });
      archive.pipe(res);
      archive.directory(folderPath, folderName);
      archive.finalize();
    }
  });

  // Download all files as ZIP
  router.get('/download-zip', (req, res) => {
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', 'attachment; filename="AirBridge_Files.zip"');
    res.setHeader('Cache-Control', 'private, max-age=86400, no-transform');
    res.setHeader('X-Content-Type-Options', 'nosniff');

    const zipBinary = fs.existsSync('/usr/bin/zip') ? '/usr/bin/zip' : (fs.existsSync('/usr/local/bin/zip') ? '/usr/local/bin/zip' : null);

    if (zipBinary) {
      const zipProcess = spawn(zipBinary, ['-0', '-q', '-r', '-', '.', '-x', '.*', '*/.*', '.chunks_temp/*'], {
        cwd: UPLOADS_DIR,
        stdio: ['ignore', 'pipe', 'pipe']
      });

      zipProcess.stdout.pipe(res);

      req.on('close', () => {
        if (!zipProcess.killed) {
          try { zipProcess.kill('SIGTERM'); } catch (e) {}
        }
      });

      zipProcess.on('error', (err) => {
        console.error('[Native Zip All Error]:', err);
        if (!res.headersSent) {
          res.status(500).json({ error: 'Failed to stream files archive' });
        }
      });
    } else {
      const archive = new ZipArchive({ zlib: { level: 0 }, highWaterMark: 4 * 1024 * 1024 });
      archive.on('error', (err) => {
        if (!res.headersSent) res.status(500).send({ error: err.message });
      });
      archive.pipe(res);
      archive.directory(UPLOADS_DIR, false);
      archive.finalize();
    }
  });

  // Delete files/folders
  function deleteFileOrDirectory(targetName) {
    if (!targetName || typeof targetName !== 'string') {
      throw new Error('Invalid filename');
    }

    const ROOT = path.resolve(UPLOADS_DIR);
    const cleanTarget = path.normalize(targetName).replace(/\\/g, '/').replace(/^(\.\.[\/\\])+/, '').replace(/^\/+/, '');
    const targetPath = path.resolve(ROOT, cleanTarget);
    const rel = path.relative(ROOT, targetPath);

    if (!rel || rel.startsWith('..') || path.isAbsolute(rel) || targetPath === ROOT || !targetPath.startsWith(ROOT + path.sep)) {
      throw new Error('Access denied: cannot delete outside root uploads folder');
    }

    if (!fs.existsSync(targetPath)) {
      return false;
    }

    fs.rmSync(targetPath, { recursive: true, force: true });
    return true;
  }

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
        invalidateCache();
        const state = stateStore.getState();
        if (state.targetedFiles && state.targetedFiles[filename]) {
          delete state.targetedFiles[filename];
          stateStore.save();
        }
        broadcast({ type: 'file_deleted', filename });
        return res.json({ success: true, filename });
      }
      return res.status(404).json({ error: 'File or directory not found' });
    } catch (err) {
      return res.status(500).json({ error: err.message || 'Failed to delete file or folder' });
    }
  };

  router.delete(/^\/files\/(.*)/, handleDeleteFileRequest);
  router.delete('/files/{*filename}', handleDeleteFileRequest);
  router.post('/files/delete', handleDeleteFileRequest);

  // System File Manager Reveal
  function openPathInSystemFileManager(targetPath, isDirectory, res) {
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
  }

  const handleRevealInFileManager = (req, res) => {
    const ROOT = path.resolve(UPLOADS_DIR);
    const rawFilename = (req.body && typeof req.body.filename === 'string') ? req.body.filename.trim() : '';

    if (!rawFilename) {
      return openPathInSystemFileManager(ROOT, true, res);
    }

    if (rawFilename.includes('..') || path.isAbsolute(rawFilename)) {
      return res.status(403).json({ error: 'Access denied: Invalid path' });
    }

    const cleanFilename = path.normalize(rawFilename).replace(/\\/g, '/').replace(/^\/+/, '');
    const targetPath = path.resolve(ROOT, cleanFilename);
    const rel = path.relative(ROOT, targetPath);

    if (!rel || rel.startsWith('..') || path.isAbsolute(rel) || !targetPath.startsWith(ROOT + path.sep)) {
      return res.status(403).json({ error: 'Access denied: Invalid path' });
    }

    if (!fs.existsSync(targetPath)) {
      return res.status(404).json({ error: 'Target path does not exist' });
    }

    const isDirectory = fs.statSync(targetPath).isDirectory();
    return openPathInSystemFileManager(targetPath, isDirectory, res);
  };

  router.post('/open-in-finder', handleRevealInFileManager);
  router.post('/reveal-file', handleRevealInFileManager);

  // Open URL on host browser
  router.post('/open-url', (req, res) => {
    const { url } = req.body;
    if (!url || typeof url !== 'string') return res.status(400).json({ error: 'No URL provided' });

    let parsedUrl;
    try {
      parsedUrl = new URL(url);
    } catch {
      return res.status(400).json({ error: 'Invalid URL format' });
    }

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

  return router;
}

module.exports = { createFilesRouter };
