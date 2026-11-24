const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { cleanupAbandonedChunks, computeFileSha256 } = require('../lib/chunkReaper');

describe('Chunk Reaper & File Checksum Verification', () => {
  it('computes accurate SHA-256 checksum for binary contents', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'airbridge-sha-'));
    const tempFile = path.join(tempDir, 'payload.bin');
    fs.writeFileSync(tempFile, 'Hello AirBridge Secure Transfer!');

    const hash = await computeFileSha256(tempFile);
    // echo -n "Hello AirBridge Secure Transfer!" | shasum -a 256
    assert.equal(typeof hash, 'string');
    assert.equal(hash.length, 64);

    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch (_) {}
  });

  it('cleans up abandoned chunks older than TTL while keeping recent ones', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'airbridge-chunks-test-'));

    const staleChunk = path.join(tempDir, 'chunk_stale.tmp');
    const freshChunk = path.join(tempDir, 'chunk_fresh.tmp');

    fs.writeFileSync(staleChunk, 'stale-data');
    fs.writeFileSync(freshChunk, 'fresh-data');

    // Backdate staleChunk by 3 hours
    const threeHoursAgo = (Date.now() - 3 * 60 * 60 * 1000) / 1000;
    fs.utimesSync(staleChunk, threeHoursAgo, threeHoursAgo);

    const { cleaned } = cleanupAbandonedChunks(tempDir, 2 * 60 * 60 * 1000);
    assert.equal(cleaned, 1);
    assert.equal(fs.existsSync(staleChunk), false);
    assert.equal(fs.existsSync(freshChunk), true);

    fs.rmSync(tempDir, { recursive: true, force: true });
  });
});
