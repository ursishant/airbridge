const express = require('express');
const path = require('path');
const fs = require('fs');
const { spawn, execFile } = require('child_process');
const { ZipArchive } = require('archiver');
const { computeFileSha256 } = require('../lib/chunkReaper');
const { isHostRequest, getClientDeviceId, getNormalizedRemoteAddress } = require('../middleware/auth');

const MIN_FREE_DISK_BYTES = 256 * 1024 * 1024; // 256MB safety margin
const MAX_UPLOAD_TOTAL_BYTES = 10 * 1024 * 1024 * 1024; // 10GB cap
const MAX_CHUNK_SIZE_BYTES = 64 * 1024 * 1024; // 64MB cap matching multer chunkUpload
const MAX_TOTAL_CHUNKS = 100000;
const DOWNLOAD_GRANT_TTL_MS = 5 * 60 * 1000; // 5-minute lease for multi-range downloads
const UNSAFE_INLINE_EXTS = new Set(['.html', '.htm', '.xhtml', '.svg', '.xml', '.js', '.mjs']);

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
    stateStore,
  } = options;

  let cachedFilesList = null;
  let lastFilesListTime = 0;

  // Short-lived download leases so parallel byte-range downloads count as 1 logical download
  const activeDownloadGrants = new Map();
  // Active sequential /upload-chunk state to prevent out-of-order corruption
  const sequentialChunkState = new Map();

  setInterval(() => {
    const now = Date.now();
    for (const [k, exp] of activeDownloadGrants.entries()) {
      if (exp <= now) activeDownloadGrants.delete(k);
    }
    for (const [id, st] of sequentialChunkState.entries()) {
      if (now - st.lastActivity > 10 * 60 * 1000) {
        try { if (st.partPath && fs.existsSync(st.partPath)) fs.unlinkSync(st.partPath); } catch (_) {}
        sequentialChunkState.delete(id);
      }
    }
  }, 60000).unref?.();

  function invalidateCache() {
    cachedFilesList = null;
  }

  function hasSufficientDiskSpace(requiredBytes = 0) {
    try {
      const st = fs.statfsSync(UPLOADS_DIR);
      const freeBytes = Number(st.bavail) * Number(st.bsize);
      const needed = Math.max(0, Number(requiredBytes) || 0);
      return (freeBytes - needed) >= MIN_FREE_DISK_BYTES;
    } catch (_) {
      return true;
    }
  }

  function checkDiskQuotaMiddleware(req, res, next) {
    const contentLength = parseInt(req.headers['content-length'] || '0', 10) || 0;
    if (!hasSufficientDiskSpace(contentLength)) {
      return res.status(507).json({ error: 'Insufficient disk space on host storage' });
    }
    next();
  }

  function checkUploadAllowedMiddleware(req, res, next) {
    const state = stateStore.getState();
    const isSimulatedPeer = Boolean(req.headers && req.headers['x-airbridge-simulated-peer']);
    const isHost = isHostRequest(req) && !isSimulatedPeer;
    if (!isHost && state.roomSettings && state.roomSettings.allowUploads === false) {
      return res.status(403).json({ error: 'File uploads are disabled by the room host' });
    }
    next();
  }

  function parseTargetedOptions(reqBody) {
    if (!reqBody || typeof reqBody !== 'object') return null;

    let targetRecipients = null;
    let maxDownloads = null;
    let expiresMinutes = null;

    if (reqBody.recipients) {
      try {
        const parsed = typeof reqBody.recipients === 'string' ? JSON.parse(reqBody.recipients) : reqBody.recipients;
        if (Array.isArray(parsed) && parsed.length > 0) {
          targetRecipients = parsed.map((id) => String(id).trim()).filter(Boolean);
          if (targetRecipients.length === 0) targetRecipients = null;
        }
      } catch (_) {}
    }

    if (reqBody.maxDownloads) {
      const md = parseInt(reqBody.maxDownloads, 10);
      if (!isNaN(md) && md > 0) maxDownloads = md;
    }

    if (reqBody.expiresMinutes) {
      const em = parseInt(reqBody.expiresMinutes, 10);
      if (!isNaN(em) && em > 0) expiresMinutes = em;
    }

    if (!targetRecipients && !maxDownloads && !expiresMinutes) {
      return null;
    }

    return {
      recipientIds: targetRecipients || [],
      maxDownloads: maxDownloads || null,
      downloadCount: 0,
      expiresAt: expiresMinutes ? Date.now() + expiresMinutes * 60 * 1000 : null,
    };
  }

  function saveTargetedMetadata(storedKey, reqBody, fallbackKey = null) {
    const meta = parseTargetedOptions(reqBody);
    if (!meta || !stateStore.setTargetedFile) return false;
    stateStore.setTargetedFile(storedKey, meta);
    if (fallbackKey && fallbackKey !== storedKey) {
      stateStore.setTargetedFile(fallbackKey, meta);
    }
    stateStore.save();
    return Boolean(meta.recipientIds.length > 0);
  }

  function getDownloadGrantKey(req, targetKey) {
    const devId = getClientDeviceId(req) || getNormalizedRemoteAddress(req) || 'anon';
    return `${devId}|${targetKey}`;
  }

  function hasActiveDownloadGrant(req, targetKey) {
    if (!targetKey) return false;
    const key = getDownloadGrantKey(req, targetKey);
    const exp = activeDownloadGrants.get(key);
    return Boolean(exp && exp > Date.now());
  }

  function consumeTargetedDownload(req, access, isRangeRequest) {
    if (!access || !access.targetInfo || !access.targetKey) return true;
    const targetInfo = access.targetInfo;
    if (!targetInfo.maxDownloads) return true;

    const grantKey = getDownloadGrantKey(req, access.targetKey);
    const existingExp = activeDownloadGrants.get(grantKey);

    if (isRangeRequest && existingExp && existingExp > Date.now()) {
      // Continuation byte-range of an already-counted transfer
      return true;
    }

    if (targetInfo.downloadCount >= targetInfo.maxDownloads) {
      return false;
    }

    targetInfo.downloadCount = (targetInfo.downloadCount || 0) + 1;
    activeDownloadGrants.set(grantKey, Date.now() + DOWNLOAD_GRANT_TTL_MS);
    stateStore.save();
    return true;
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
      } catch (e) { }
    }
    recurse(dirPath);
    return { count, totalBytes };
  }

  function collectPermittedArchiveEntries(dirPath, req) {
    const permitted = [];
    let excludedCount = 0;
    const ROOT = path.resolve(UPLOADS_DIR);

    function recurse(current) {
      let items = [];
      try {
        items = fs.readdirSync(current);
      } catch (_) {
        return;
      }
      for (const item of items) {
        if (item.startsWith('.') || item === 'Thumbs.db') continue;
        const full = path.join(current, item);
        let st;
        try {
          st = fs.statSync(full);
        } catch (_) {
          continue;
        }
        if (st.isDirectory()) {
          recurse(full);
        } else if (st.isFile()) {
          const relFromUploads = path.relative(ROOT, full).replace(/\\/g, '/');
          const access = isClientPermittedForFile(req, relFromUploads, item);
          if (access.permitted) {
            const relInsideArchive = path.relative(dirPath, full).replace(/\\/g, '/');
            permitted.push({
              fullPath: full,
              archiveName: relInsideArchive,
              relFromUploads,
              filename: item,
              access,
            });
          } else {
            excludedCount++;
          }
        }
      }
    }

    recurse(dirPath);
    return { permitted, excludedCount };
  }

  /**
   * Checks whether the requesting client is allowed to see or download this file.
   * Host is ALWAYS allowed.
   * If file is targeted, clientDeviceId must be in recipientIds list.
   * Checks download limits and expiration.
   */
  function isClientPermittedForFile(req, fileKey, fallbackName = null) {
    const isSimulatedPeer = Boolean(req.headers && req.headers['x-airbridge-simulated-peer']);
    if (isHostRequest(req) && !isSimulatedPeer) {
      return { permitted: true };
    }

    let resolvedKey = fileKey;
    let targetInfo = stateStore.getTargetedFile ? stateStore.getTargetedFile(fileKey) : null;
    if (!targetInfo && fallbackName && stateStore.getTargetedFile) {
      targetInfo = stateStore.getTargetedFile(fallbackName);
      if (targetInfo) resolvedKey = fallbackName;
    }

    if (!targetInfo) {
      // Normal untargeted file: visible to anyone authorized in room
      return { permitted: true };
    }

    const clientDevId = getClientDeviceId(req);

    // Check expiration
    if (targetInfo.expiresAt && Date.now() > targetInfo.expiresAt) {
      return { permitted: false, reason: 'File link has expired' };
    }

    // Check recipient whitelist BEFORE exposing download limit
    if (Array.isArray(targetInfo.recipientIds) && targetInfo.recipientIds.length > 0) {
      if (!clientDevId || !targetInfo.recipientIds.includes(clientDevId)) {
        return { permitted: false, reason: 'This file is targeted to specific recipients only' };
      }
    }

    // Check max download limit (allow active multi-range transfer grant)
    if (targetInfo.maxDownloads && targetInfo.downloadCount >= targetInfo.maxDownloads) {
      if (!hasActiveDownloadGrant(req, resolvedKey)) {
        return { permitted: false, reason: 'File download limit reached' };
      }
    }

    return { permitted: true, targetInfo, targetKey: resolvedKey };
  }

  // Upload endpoint (supports targeted recipient list and ephemeral limits)
  router.post('/upload', checkUploadAllowedMiddleware, checkDiskQuotaMiddleware, upload.array('files'), (req, res) => {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'No files uploaded' });
    }

    const totalUploadedSize = req.files.reduce((acc, f) => acc + (f.size || 0), 0);
    if (!hasSufficientDiskSpace(totalUploadedSize)) {
      req.files.forEach((f) => { try { fs.unlinkSync(f.path); } catch (_) {} });
      return res.status(507).json({ error: 'Insufficient disk space on host storage' });
    }

    const targetedMeta = parseTargetedOptions(req.body);

    const uploadedFiles = req.files.map((file) => {
      const relFromUploads = path.relative(UPLOADS_DIR, file.path).replace(/\\/g, '/');
      const isInsideFolder = relFromUploads.includes('/');
      const topFolder = isInsideFolder ? relFromUploads.split('/')[0] : null;

      if (targetedMeta && stateStore.setTargetedFile) {
        const clonedMeta = {
          recipientIds: [...targetedMeta.recipientIds],
          maxDownloads: targetedMeta.maxDownloads,
          downloadCount: 0,
          expiresAt: targetedMeta.expiresAt,
        };
        stateStore.setTargetedFile(file.filename, clonedMeta);
        if (relFromUploads !== file.filename) {
          stateStore.setTargetedFile(relFromUploads, clonedMeta);
        }
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
        targeted: Boolean(targetedMeta && targetedMeta.recipientIds.length > 0),
      };
    });

    if (targetedMeta) {
      stateStore.save();
    }
    invalidateCache();

    // Broadcast WebSocket notification only to targeted recipients (or everyone if untargeted)
    broadcastFilesUploaded(uploadedFiles, req.body.sender || 'Unknown Device');

    res.json({
      success: true,
      files: uploadedFiles,
    });
  });

  // Resumable Chunked Upload for large files (sequential)
  router.post('/upload-chunk', checkUploadAllowedMiddleware, checkDiskQuotaMiddleware, chunkUpload.single('chunk'), async (req, res) => {
    const safeChunksDir = path.resolve(CHUNKS_TEMP_DIR);
    const chunkFileName = path.basename(req.file ? req.file.path : '');
    const safeChunkPath = path.resolve(safeChunksDir, chunkFileName);
    const isChunkValid = chunkFileName.length > 0 && safeChunkPath.startsWith(safeChunksDir + path.sep);

    const cleanupChunk = () => {
      if (isChunkValid && fs.existsSync(safeChunkPath)) {
        try { fs.unlinkSync(safeChunkPath); } catch (e) { }
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
      } = req.body;

      if (!req.file || !fileId || chunkIndex === undefined || totalChunks === undefined || !filename) {
        cleanupChunk();
        return res.status(400).json({ error: 'Missing chunk upload parameters' });
      }

      const cIndex = Number(chunkIndex);
      const tChunks = Number(totalChunks);
      const safeFileId = String(fileId).replace(/[^a-zA-Z0-9_-]/g, '');

      if (safeFileId.length < 4 || safeFileId.length > 128) {
        cleanupChunk();
        return res.status(400).json({ error: 'Invalid fileId format' });
      }
      if (!Number.isInteger(tChunks) || tChunks < 1 || tChunks > MAX_TOTAL_CHUNKS) {
        cleanupChunk();
        return res.status(400).json({ error: 'Invalid totalChunks value' });
      }
      if (!Number.isInteger(cIndex) || cIndex < 0 || cIndex >= tChunks) {
        cleanupChunk();
        return res.status(400).json({ error: 'Chunk index out of bounds' });
      }

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
      const resolvedTempPath = path.resolve(targetDir, `.${baseName}.${safeFileId}.part`);

      if (!resolvedTempPath.startsWith(ROOT + path.sep)) {
        cleanupChunk();
        return res.status(403).json({ error: 'Access denied: Invalid temp path' });
      }

      let seqState = sequentialChunkState.get(safeFileId);
      if (cIndex === 0) {
        if (fs.existsSync(resolvedTempPath)) {
          try { fs.unlinkSync(resolvedTempPath); } catch (e) { }
        }
        seqState = {
          nextIndex: 0,
          filename: String(filename),
          partPath: resolvedTempPath,
          targetedMeta: parseTargetedOptions(req.body),
          lastActivity: Date.now(),
        };
        sequentialChunkState.set(safeFileId, seqState);
      } else {
        if (!seqState || seqState.filename !== String(filename)) {
          cleanupChunk();
          return res.status(409).json({ error: 'Upload session not initialized or filename mismatch' });
        }
        if (seqState.nextIndex !== cIndex) {
          cleanupChunk();
          return res.status(409).json({
            error: `Out-of-order chunk: expected ${seqState.nextIndex}, got ${cIndex}`,
          });
        }
        if (!seqState.targetedMeta) {
          seqState.targetedMeta = parseTargetedOptions(req.body);
        }
      }

      if (!hasSufficientDiskSpace(req.file.size || 0)) {
        cleanupChunk();
        return res.status(507).json({ error: 'Insufficient disk space on host storage' });
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

      seqState.nextIndex = cIndex + 1;
      seqState.lastActivity = Date.now();

      if (cIndex === tChunks - 1) {
        const finalMeta = seqState.targetedMeta || parseTargetedOptions(req.body);
        sequentialChunkState.delete(safeFileId);

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
            try { fs.unlinkSync(finalDest); } catch (_) { }
            return res.status(400).json({ error: 'Checksum mismatch: file corrupted in transit' });
          }
        }

        const stats = fs.statSync(finalDest);
        const relFromUploads = path.relative(UPLOADS_DIR, finalDest).replace(/\\/g, '/');
        const isInsideFolder = relFromUploads.includes('/');
        const topFolder = isInsideFolder ? relFromUploads.split('/')[0] : null;
        const storedName = path.basename(finalDest);

        if (finalMeta && stateStore.setTargetedFile) {
          stateStore.setTargetedFile(storedName, finalMeta);
          if (relFromUploads !== storedName) {
            stateStore.setTargetedFile(relFromUploads, finalMeta);
          }
          stateStore.save();
        }

        const fileInfo = {
          name: storedName,
          originalName: filename,
          relativePath: relFromUploads,
          folder: topFolder,
          size: stats.size,
          mimetype: req.file.mimetype || 'application/octet-stream',
          path: `/api/files/${relFromUploads.split('/').map(encodeURIComponent).join('/')}`,
          fullPath: finalDest,
          uploadedAt: Date.now(),
          targeted: Boolean(finalMeta && finalMeta.recipientIds.length > 0),
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
      if (now - t.lastActivity > 10 * 60 * 1000 && t.activeWrites === 0) {
        try { if (t.fd) fs.closeSync(t.fd); } catch (e) { }
        try { if (fs.existsSync(t.partPath)) fs.unlinkSync(t.partPath); } catch (e) { }
        activeTransfers.delete(id);
      }
    }
  }, 60000).unref?.();

  router.post('/upload-parallel', checkUploadAllowedMiddleware, checkDiskQuotaMiddleware, chunkUpload.single('chunk'), async (req, res) => {
    const safeChunksDir = path.resolve(CHUNKS_TEMP_DIR);
    const chunkFileName = path.basename(req.file ? req.file.path : '');
    const safeChunkPath = path.resolve(safeChunksDir, chunkFileName);
    const isChunkValid = chunkFileName.length > 0 && safeChunkPath.startsWith(safeChunksDir + path.sep);

    const cleanupTempChunk = () => {
      if (isChunkValid && fs.existsSync(safeChunkPath)) {
        try { fs.unlinkSync(safeChunkPath); } catch (e) { }
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

      const cIndex = Number(chunkIndex);
      const tChunks = Number(totalChunks);
      const cSize = chunkSize !== undefined ? Number(chunkSize) : (16 * 1024 * 1024);
      const safeFileId = String(fileId).replace(/[^a-zA-Z0-9_-]/g, '');

      if (safeFileId.length < 4 || safeFileId.length > 128) {
        cleanupTempChunk();
        return res.status(400).json({ error: 'Invalid fileId format' });
      }
      if (!Number.isInteger(tChunks) || tChunks < 1 || tChunks > MAX_TOTAL_CHUNKS) {
        cleanupTempChunk();
        return res.status(400).json({ error: 'Invalid totalChunks value' });
      }
      if (!Number.isInteger(cIndex) || cIndex < 0 || cIndex >= tChunks) {
        cleanupTempChunk();
        return res.status(400).json({ error: 'Chunk index out of bounds' });
      }
      if (!Number.isInteger(cSize) || cSize < 1 || cSize > MAX_CHUNK_SIZE_BYTES) {
        cleanupTempChunk();
        return res.status(400).json({ error: 'Invalid chunkSize value' });
      }

      const position = cIndex * cSize;
      if (position + req.file.size > MAX_UPLOAD_TOTAL_BYTES) {
        cleanupTempChunk();
        return res.status(413).json({ error: 'File exceeds maximum 10GB transfer limit' });
      }

      let transfer = activeTransfers.get(safeFileId);
      if (!transfer) {
        const declaredSize = parseInt(fileSize, 10) || (tChunks * cSize);
        if (!hasSufficientDiskSpace(declaredSize)) {
          cleanupTempChunk();
          return res.status(507).json({ error: 'Insufficient disk space on host storage' });
        }

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
          chunkSize: cSize,
          filename: String(filename),
          relativePath: cleanRel,
          sender: sender || 'Unknown Device',
          fileSize: parseInt(fileSize, 10) || 0,
          expectedSha256: expectedSha256 ? String(expectedSha256).trim() : null,
          targetedMeta: parseTargetedOptions(req.body),
          activeWrites: 0,
          finalizing: false,
          lastActivity: Date.now(),
        };
        activeTransfers.set(safeFileId, transfer);
      } else {
        if (transfer.filename !== String(filename) || transfer.totalChunks !== tChunks || transfer.chunkSize !== cSize) {
          cleanupTempChunk();
          return res.status(409).json({ error: 'Conflicting upload parameters for active fileId' });
        }
        if (transfer.finalizing) {
          cleanupTempChunk();
          return res.status(409).json({ error: 'Transfer already finalizing' });
        }
        if (!transfer.targetedMeta) {
          transfer.targetedMeta = parseTargetedOptions(req.body);
        }
      }

      if (!hasSufficientDiskSpace(req.file.size || 0)) {
        cleanupTempChunk();
        return res.status(507).json({ error: 'Insufficient disk space on host storage' });
      }

      const chunkBuf = fs.readFileSync(safeChunkPath);
      transfer.activeWrites++;
      try {
        await new Promise((resolve, reject) => {
          fs.write(transfer.fd, chunkBuf, 0, chunkBuf.length, position, (err) => {
            if (err) return reject(err);
            resolve();
          });
        });
      } finally {
        transfer.activeWrites--;
        cleanupTempChunk();
      }

      transfer.received.add(cIndex);
      transfer.lastActivity = Date.now();

      if (transfer.received.size >= tChunks && transfer.activeWrites === 0 && !transfer.finalizing) {
        transfer.finalizing = true;
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
            try { fs.unlinkSync(finalDest); } catch (e) { }
          }
        }

        fs.renameSync(transfer.partPath, finalDest);

        if (transfer.expectedSha256) {
          const actualSha256 = await computeFileSha256(finalDest);
          if (actualSha256.toLowerCase() !== transfer.expectedSha256.toLowerCase()) {
            try { fs.unlinkSync(finalDest); } catch (_) { }
            return res.status(400).json({ error: 'Checksum mismatch: file corrupted in transit' });
          }
        }

        const stats = fs.statSync(finalDest);
        const relFromUploads = path.relative(UPLOADS_DIR, finalDest).replace(/\\/g, '/');
        const topFolder = isInsideFolder ? relFromUploads.split('/')[0] : null;
        const storedName = path.basename(finalDest);

        if (transfer.targetedMeta && stateStore.setTargetedFile) {
          stateStore.setTargetedFile(storedName, transfer.targetedMeta);
          if (relFromUploads !== storedName) {
            stateStore.setTargetedFile(relFromUploads, transfer.targetedMeta);
          }
          stateStore.save();
        }

        const fileInfo = {
          name: storedName,
          originalName: transfer.filename,
          relativePath: relFromUploads,
          folder: topFolder,
          size: stats.size,
          mimetype: req.file.mimetype || 'application/octet-stream',
          path: `/api/files/${relFromUploads.split('/').map(encodeURIComponent).join('/')}`,
          fullPath: finalDest,
          uploadedAt: Date.now(),
          targeted: Boolean(transfer.targetedMeta && transfer.targetedMeta.recipientIds.length > 0),
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
  router.post('/upload-snap', checkUploadAllowedMiddleware, checkDiskQuotaMiddleware, upload.single('file'), (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'No image uploaded' });
      }

      if (!hasSufficientDiskSpace(req.file.size || 0)) {
        try { fs.unlinkSync(req.file.path); } catch (_) {}
        return res.status(507).json({ error: 'Insufficient disk space on host storage' });
      }

      const targetedMeta = parseTargetedOptions(req.body);
      if (targetedMeta && stateStore.setTargetedFile) {
        stateStore.setTargetedFile(req.file.filename, targetedMeta);
        stateStore.save();
      }

      const fileInfo = {
        name: req.file.filename,
        originalName: req.file.originalname,
        relativePath: req.file.filename,
        size: req.file.size,
        mimetype: req.file.mimetype || 'image/jpeg',
        path: `/api/files/${encodeURIComponent(req.file.filename)}`,
        fullPath: req.file.path,
        uploadedAt: Date.now(),
        isSnap: true,
        note: req.body.note || '',
        targeted: Boolean(targetedMeta && targetedMeta.recipientIds.length > 0),
      };

      if (isMac) {
        execFile('afplay', ['/System/Library/Components/CoreAudio.component/Contents/SharedSupport/SystemSounds/system/payment_success.caf'], (err) => {
          if (err) execFile('afplay', ['/System/Library/Sounds/Ping.aiff'], () => { });
        });
      }

      invalidateCache();
      broadcastFilesUploaded([fileInfo], req.body.sender || 'Mobile Camera');

      res.json({ success: true, file: fileInfo });
    } catch (err) {
      console.error('[Snap Upload Error]', err);
      res.status(500).json({ error: err.message });
    }
  });

  // List files (filters targeted files and private folders for unauthorized peers)
  router.get('/files', (req, res) => {
    const isHost = isHostRequest(req) && !Boolean(req.headers && req.headers['x-airbridge-simulated-peer']);
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

        const fullPath = path.join(UPLOADS_DIR, item);
        try {
          const stats = fs.statSync(fullPath);
          if (stats.isDirectory()) {
            const { permitted, excludedCount } = isHost
              ? { permitted: [], excludedCount: 0 }
              : collectPermittedArchiveEntries(fullPath, req);

            if (!isHost && excludedCount > 0 && permitted.length === 0) {
              continue;
            }

            const dirStats = getDirectoryStats(fullPath);
            files.push({
              name: item,
              isDirectory: true,
              fileCount: !isHost && excludedCount > 0 ? permitted.length : dirStats.count,
              size: dirStats.totalBytes,
              modifiedAt: stats.mtimeMs,
              path: `/api/download-folder/${encodeURIComponent(item)}`,
            });
          } else if (stats.isFile()) {
            const access = isClientPermittedForFile(req, item);
            if (!access.permitted) {
              continue;
            }
            files.push({
              name: item,
              isDirectory: false,
              size: stats.size,
              modifiedAt: stats.mtimeMs,
              path: `/api/files/${encodeURIComponent(item)}`,
            });
          }
        } catch (e) { }
      }

      files.sort((a, b) => b.modifiedAt - a.modifiedAt);
      if (isHost) {
        cachedFilesList = files;
        lastFilesListTime = now;
      }
      res.json({ files });
    });
  });

  function handleServeFile(req, res, { inlineSafe = false } = {}) {
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
    const access = isClientPermittedForFile(req, cleanPath, filename);
    if (!access.permitted) {
      return res.status(403).json({ error: access.reason || 'Forbidden' });
    }

    const stat = fs.statSync(filePath);
    if (!stat.isFile()) {
      return res.status(400).json({ error: 'Not a file' });
    }

    const fileSize = stat.size;
    const rangeHeader = req.headers.range;
    let rangeStart = 0;
    let rangeEnd = fileSize - 1;

    if (rangeHeader) {
      const match = rangeHeader.match(/bytes=(\d+)-(\d*)/);
      if (!match) {
        res.setHeader('Content-Range', `bytes */${fileSize}`);
        return res.status(416).json({ error: 'Invalid Range header' });
      }
      rangeStart = parseInt(match[1], 10);
      rangeEnd = match[2] ? parseInt(match[2], 10) : fileSize - 1;
      if (rangeStart >= fileSize || rangeEnd >= fileSize || rangeStart > rangeEnd) {
        res.setHeader('Content-Range', `bytes */${fileSize}`);
        return res.status(416).json({ error: 'Range Not Satisfiable' });
      }
    }

    // Consume 1 logical download credit (grouped by active lease for parallel ranges)
    if (!consumeTargetedDownload(req, access, Boolean(rangeHeader))) {
      return res.status(403).json({ error: 'File download limit reached' });
    }

    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'private, max-age=86400, no-transform');

    if (inlineSafe) {
      res.setHeader(
        'Content-Security-Policy',
        "sandbox; default-src 'none'; img-src 'self' data:; media-src 'self'; style-src 'unsafe-inline';"
      );
      const ext = path.extname(filename).toLowerCase();
      if (UNSAFE_INLINE_EXTS.has(ext)) {
        res.setHeader('Content-Type', 'application/octet-stream');
        res.setHeader(
          'Content-Disposition',
          `attachment; filename="${encodeURIComponent(filename)}"; filename*=UTF-8''${encodeURIComponent(filename)}`
        );
      }
      return res.sendFile(filePath);
    }

    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${encodeURIComponent(filename)}"; filename*=UTF-8''${encodeURIComponent(filename)}`
    );

    if (rangeHeader) {
      const contentLength = rangeEnd - rangeStart + 1;
      res.status(206);
      res.setHeader('Content-Range', `bytes ${rangeStart}-${rangeEnd}/${fileSize}`);
      res.setHeader('Content-Length', contentLength);
      const stream = fs.createReadStream(filePath, { start: rangeStart, end: rangeEnd, highWaterMark: 4 * 1024 * 1024 });
      stream.pipe(res);
    } else {
      res.setHeader('Content-Length', fileSize);
      const stream = fs.createReadStream(filePath, { highWaterMark: 4 * 1024 * 1024 });
      stream.pipe(res);
    }
  }

  // Download single file with Range support & targeted check
  router.get(/^\/files\/(.*)/, (req, res) => handleServeFile(req, res));

  // Ranged File Download (shares identical permission, lease & download counting)
  router.get(/^\/files-ranged\/(.*)/, (req, res) => handleServeFile(req, res));

  // Raw file preview (sandboxed CSP + attachment fallback for scripting types)
  router.get(/^\/files-raw\/(.*)/, (req, res) => handleServeFile(req, res, { inlineSafe: true }));

  function streamZipFiltered(req, res, dirPath, downloadFilename, nativeZipArgs, nativeCwd, enforceNonEmpty = false) {
    const isHost = isHostRequest(req) && !Boolean(req.headers && req.headers['x-airbridge-simulated-peer']);
    const { permitted, excludedCount } = isHost
      ? { permitted: null, excludedCount: 0 }
      : collectPermittedArchiveEntries(dirPath, req);

    if (enforceNonEmpty && !isHost && excludedCount > 0 && permitted.length === 0) {
      return res.status(403).json({ error: 'All files in this folder are targeted to specific recipients or expired' });
    }

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${encodeURIComponent(downloadFilename)}.zip"; filename*=UTF-8''${encodeURIComponent(downloadFilename)}.zip`
    );
    res.setHeader('Cache-Control', 'private, max-age=86400, no-transform');
    res.setHeader('X-Content-Type-Options', 'nosniff');

    const zipBinary = fs.existsSync('/usr/bin/zip') ? '/usr/bin/zip' : (fs.existsSync('/usr/local/bin/zip') ? '/usr/local/bin/zip' : null);

    if (excludedCount === 0 && zipBinary) {
      const zipProcess = spawn(zipBinary, nativeZipArgs, {
        cwd: nativeCwd,
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      zipProcess.stdout.pipe(res);

      req.on('close', () => {
        if (!zipProcess.killed) {
          try { zipProcess.kill('SIGTERM'); } catch (e) { }
        }
      });

      zipProcess.on('error', (err) => {
        console.error('[Native Zip Error]:', err);
        if (!res.headersSent) {
          res.status(500).json({ error: 'Failed to stream archive' });
        }
      });
      return;
    }

    const archive = new ZipArchive({ zlib: { level: 0 }, highWaterMark: 4 * 1024 * 1024 });
    archive.on('error', (err) => {
      if (!res.headersSent) res.status(500).send({ error: err.message });
    });
    archive.pipe(res);

    if (permitted !== null) {
      for (const entry of permitted) {
        if (entry.access?.targetInfo) {
          consumeTargetedDownload(req, entry.access, false);
        }
        const entryName = enforceNonEmpty ? `${downloadFilename}/${entry.archiveName}` : entry.archiveName;
        archive.file(entry.fullPath, { name: entryName });
      }
    } else {
      archive.directory(dirPath, enforceNonEmpty ? downloadFilename : false);
    }

    archive.finalize();
  }

  // Download folder as ZIP (filters targeted files per recipient)
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
    return streamZipFiltered(
      req,
      res,
      folderPath,
      folderName,
      ['-0', '-q', '-r', '-', folderName],
      path.dirname(folderPath),
      true
    );
  });

  // Download all files as ZIP (filters targeted files per recipient)
  router.get('/download-zip', (req, res) => {
    return streamZipFiltered(
      req,
      res,
      UPLOADS_DIR,
      'AirBridge_Files',
      ['-0', '-q', '-r', '-', '.', '-x', '.*', '*/.*', '.chunks_temp/*'],
      UPLOADS_DIR,
      false
    );
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

    const canDeleteTarget = (targetName) => {
      const isSimulatedPeer = Boolean(req.headers && req.headers['x-airbridge-simulated-peer']);
      if (isHostRequest(req) && !isSimulatedPeer) return true;
      const ROOT = path.resolve(UPLOADS_DIR);
      const cleanTarget = path.normalize(targetName).replace(/\\/g, '/').replace(/^(\.\.[\/\\])+/, '').replace(/^\/+/, '');
      const targetPath = path.resolve(ROOT, cleanTarget);
      const rel = path.relative(ROOT, targetPath);
      if (!rel || rel.startsWith('..') || path.isAbsolute(rel) || !targetPath.startsWith(ROOT + path.sep)) {
        return true; // Let deleteFileOrDirectory reject traversal normally
      }
      if (fs.existsSync(targetPath) && fs.statSync(targetPath).isDirectory()) {
        return collectPermittedArchiveEntries(targetPath, req).excludedCount === 0;
      }
      return isClientPermittedForFile(req, cleanTarget, path.basename(targetPath)).permitted;
    };

    if (!canDeleteTarget(filename)) {
      return res.status(403).json({ error: 'Forbidden: cannot delete another recipient\'s targeted file' });
    }

    try {
      const deleted = deleteFileOrDirectory(filename);
      if (deleted) {
        invalidateCache();
        if (stateStore.removeTargetedFile) {
          stateStore.removeTargetedFile(filename);
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

  // Bulk / Batch Delete Endpoint
  const handleBulkDeleteFilesRequest = (req, res) => {
    const rawFiles = req.body && req.body.filenames;
    if (!Array.isArray(rawFiles) || rawFiles.length === 0) {
      return res.status(400).json({ error: 'Array of filenames is required' });
    }

    const deleted = [];
    const errors = [];

    for (const name of rawFiles) {
      if (typeof name !== 'string' || !name.trim()) continue;
      const safeName = name.trim();
      const isSimulatedPeer = Boolean(req.headers && req.headers['x-airbridge-simulated-peer']);
      if (!isHostRequest(req) || isSimulatedPeer) {
        const ROOT = path.resolve(UPLOADS_DIR);
        const cleanTarget = path.normalize(safeName).replace(/\\/g, '/').replace(/^(\.\.[\/\\])+/, '').replace(/^\/+/, '');
        const targetPath = path.resolve(ROOT, cleanTarget);
        const rel = path.relative(ROOT, targetPath);
        if (rel && !rel.startsWith('..') && !path.isAbsolute(rel) && targetPath.startsWith(ROOT + path.sep) && fs.existsSync(targetPath)) {
          const allowed = fs.statSync(targetPath).isDirectory()
            ? collectPermittedArchiveEntries(targetPath, req).excludedCount === 0
            : isClientPermittedForFile(req, cleanTarget, path.basename(targetPath)).permitted;
          if (!allowed) {
            errors.push({ filename: safeName, error: 'Forbidden' });
            continue;
          }
        }
      }
      try {
        const ok = deleteFileOrDirectory(safeName);
        if (ok) {
          deleted.push(safeName);
          if (stateStore.removeTargetedFile) {
            stateStore.removeTargetedFile(safeName);
          }
          broadcast({ type: 'file_deleted', filename: safeName });
        } else {
          errors.push({ filename: name, error: 'Not found' });
        }
      } catch (err) {
        errors.push({ filename: name, error: err.message });
      }
    }

    if (deleted.length > 0) {
      invalidateCache();
      stateStore.save();
    }

    return res.json({
      success: true,
      deletedCount: deleted.length,
      deleted,
      errors,
    });
  };

  router.post('/files/bulk-delete', handleBulkDeleteFilesRequest);
  router.delete('/files/bulk-delete', handleBulkDeleteFilesRequest);

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
    if (!isHostRequest(req)) {
      return res.status(403).json({ error: 'Only the host machine can reveal files in local file manager' });
    }

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

  // Open URL on host browser (rate-limited against flood)
  const openUrlTimestamps = new Map();
  router.post('/open-url', (req, res) => {
    const remoteIp = getNormalizedRemoteAddress(req) || 'local';
    if (!isHostRequest(req)) {
      const now = Date.now();
      const recent = (openUrlTimestamps.get(remoteIp) || []).filter((t) => now - t < 60000);
      if (recent.length >= 15) {
        return res.status(429).json({ error: 'Rate limit exceeded for opening URLs on host' });
      }
      recent.push(now);
      openUrlTimestamps.set(remoteIp, recent);
    }

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
