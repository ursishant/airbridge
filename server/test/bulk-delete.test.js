const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { app, stateStore, UPLOADS_DIR } = require('../index');

describe('Bulk Delete Integration Tests', () => {
  it('validates request format, protects against traversal, and deletes files/folders in batch', async () => {
    const testServer = http.createServer(app);
    await new Promise((resolve) => {
      testServer.listen(0, '127.0.0.1', resolve);
    });

    const port = testServer.address().port;
    const baseUrl = `http://127.0.0.1:${port}`;

    try {
      // 1. Rejects invalid payload
      const emptyRes = await fetch(`${baseUrl}/api/files/bulk-delete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      assert.equal(emptyRes.status, 400);

      // 2. Setup dummy files and folders in UPLOADS_DIR
      const file1 = path.join(UPLOADS_DIR, 'bulk_test_a.txt');
      const file2 = path.join(UPLOADS_DIR, 'bulk_test_b.txt');
      const testDir = path.join(UPLOADS_DIR, 'bulk_test_folder');
      const nestedFile = path.join(testDir, 'nested.txt');

      fs.writeFileSync(file1, 'hello 1');
      fs.writeFileSync(file2, 'hello 2');
      if (!fs.existsSync(testDir)) fs.mkdirSync(testDir, { recursive: true });
      fs.writeFileSync(nestedFile, 'nested content');

      // Add to targetedFiles state
      const state = stateStore.getState();
      if (!state.targetedFiles) state.targetedFiles = {};
      state.targetedFiles['bulk_test_a.txt'] = ['device_1'];

      // 3. Test path traversal safety alongside valid files
      const traversalRes = await fetch(`${baseUrl}/api/files/bulk-delete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filenames: ['../../outside_secret.txt', 'bulk_test_a.txt'],
        }),
      });
      assert.equal(traversalRes.status, 200);
      const traversalData = await traversalRes.json();
      assert.equal(traversalData.deletedCount, 1);
      assert.ok(traversalData.deleted.includes('bulk_test_a.txt'));
      assert.ok(traversalData.errors.some((e) => e.filename.includes('outside_secret.txt')));
      assert.equal(fs.existsSync(file1), false);
      assert.equal(state.targetedFiles['bulk_test_a.txt'], undefined);

      // 4. Test deleting remaining file and folder via DELETE /api/files/bulk-delete
      const batchRes = await fetch(`${baseUrl}/api/files/bulk-delete`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filenames: ['bulk_test_b.txt', 'bulk_test_folder'],
        }),
      });
      assert.equal(batchRes.status, 200);
      const batchData = await batchRes.json();
      assert.equal(batchData.deletedCount, 2);
      assert.equal(fs.existsSync(file2), false);
      assert.equal(fs.existsSync(testDir), false);
    } finally {
      await new Promise((resolve) => testServer.close(resolve));
    }
  });
});
