const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { StateStore } = require('../lib/stateStore');

describe('State Persistence & Atomic Concurrency', () => {
  it('serializes concurrent state writes without corruption', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'airbridge-state-test-'));
    const store = new StateStore({ appDataDir: tempDir });

    const concurrentPromises = [];
    for (let i = 0; i < 25; i++) {
      store.getState().chatHistory.push({
        id: `msg_${i}`,
        text: `Message ${i}`,
        timestamp: Date.now() + i,
      });
      concurrentPromises.push(store.save());
    }

    await Promise.all(concurrentPromises);

    const savedRaw = fs.readFileSync(store.stateFilePath, 'utf8');
    const parsed = JSON.parse(savedRaw);
    assert.equal(parsed.chatHistory.length, 25);
    assert.equal(parsed.chatHistory[24].id, 'msg_24');

    // Clean up
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('migrates legacy state file from uploads directory', async () => {
    const tempAppData = fs.mkdtempSync(path.join(os.tmpdir(), 'airbridge-appdata-'));
    const tempUploads = fs.mkdtempSync(path.join(os.tmpdir(), 'airbridge-uploads-'));

    // Create legacy file
    const legacyState = {
      chatHistory: [{ id: 'legacy_1', text: 'Hello from past' }],
      clipboardHistory: [],
      knownDevices: [],
      officeSecurity: { enabled: true, pin: '7788' },
    };
    fs.writeFileSync(path.join(tempUploads, '.airbridge_state.json'), JSON.stringify(legacyState), 'utf8');

    // Init store with legacyUploadsDir
    const store = new StateStore({
      appDataDir: tempAppData,
      legacyUploadsDir: tempUploads,
    });

    const state = store.getState();
    assert.equal(state.officeSecurity.enabled, true);
    assert.equal(state.officeSecurity.pin, '7788');
    assert.equal(state.chatHistory[0].text, 'Hello from past');

    // Legacy file should be migrated
    assert.equal(fs.existsSync(path.join(tempUploads, '.airbridge_state.json')), false);
    assert.equal(fs.existsSync(store.stateFilePath), true);

    fs.rmSync(tempAppData, { recursive: true, force: true });
    fs.rmSync(tempUploads, { recursive: true, force: true });
  });
});
