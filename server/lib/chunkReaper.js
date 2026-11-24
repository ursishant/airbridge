const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

const CHUNKS_TEMP_DIR = path.join(os.tmpdir(), 'airbridge_chunks');

/**
 * Reaps abandoned chunks older than maxAgeMs (default: 2 hours).
 * Runs on startup and periodically (every 15 minutes).
 */
function cleanupAbandonedChunks(dir = CHUNKS_TEMP_DIR, maxAgeMs = 2 * 60 * 60 * 1000) {
  try {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
      return { cleaned: 0, errors: 0 };
    }

    const files = fs.readdirSync(dir);
    const now = Date.now();
    let cleaned = 0;
    let errors = 0;

    for (const file of files) {
      const fullPath = path.join(dir, file);
      try {
        const stat = fs.statSync(fullPath);
        if (now - stat.mtimeMs > maxAgeMs) {
          fs.unlinkSync(fullPath);
          cleaned++;
        }
      } catch (err) {
        errors++;
      }
    }

    if (cleaned > 0) {
      console.log(`[ChunkReaper] Cleaned up ${cleaned} abandoned temporary chunk(s) from ${dir}`);
    }
    return { cleaned, errors };
  } catch (err) {
    console.error('[ChunkReaper] Failed to scan chunk directory:', err.message);
    return { cleaned: 0, errors: 1 };
  }
}

/**
 * Starts periodic reaper timer
 */
function startChunkReaper(dir = CHUNKS_TEMP_DIR, intervalMs = 15 * 60 * 1000, maxAgeMs = 2 * 60 * 60 * 1000) {
  // Run once immediately on startup
  cleanupAbandonedChunks(dir, maxAgeMs);

  const timer = setInterval(() => {
    cleanupAbandonedChunks(dir, maxAgeMs);
  }, intervalMs);

  if (timer.unref) {
    timer.unref();
  }

  return timer;
}

/**
 * Computes SHA-256 checksum of a file
 */
function computeFileSha256(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);
    stream.on('error', reject);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
  });
}

module.exports = {
  CHUNKS_TEMP_DIR,
  cleanupAbandonedChunks,
  startChunkReaper,
  computeFileSha256,
};
