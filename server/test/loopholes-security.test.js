const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocket } = require('ws');
const { app, server, stateStore, UPLOADS_DIR } = require('../index');
const {
  createCorsOriginValidator,
  registerActiveDeviceIp,
  unregisterActiveDeviceIp,
  getClientDeviceId,
  resetPinAttempts,
} = require('../middleware/auth');

describe('Security Loophole Regression Tests', () => {
  it('blocks non-host peers from calling /api/office/configure and /api/open-in-finder', async () => {
    const testServer = http.createServer(app);
    await new Promise((resolve) => testServer.listen(0, '127.0.0.1', resolve));
    const baseUrl = `http://127.0.0.1:${testServer.address().port}`;

    const state = stateStore.getState();
    const prevEnabled = state.officeSecurity.enabled;
    const prevReqApproval = state.officeSecurity.requireApproval;
    const prevPin = state.officeSecurity.pin;

    try {
      state.officeSecurity.enabled = true;
      state.officeSecurity.requireApproval = false;
      state.officeSecurity.pin = '7777';

      const peerConfigureRes = await fetch(`${baseUrl}/api/office/configure`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-airbridge-simulated-peer': 'true',
          'x-airbridge-pin': '7777',
        },
        body: JSON.stringify({ enabled: false }),
      });
      assert.equal(peerConfigureRes.status, 403);
      assert.equal(state.officeSecurity.enabled, true);

      const peerFinderRes = await fetch(`${baseUrl}/api/open-in-finder`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-airbridge-simulated-peer': 'true',
          'x-airbridge-pin': '7777',
        },
        body: JSON.stringify({}),
      });
      assert.equal(peerFinderRes.status, 403);
    } finally {
      state.officeSecurity.enabled = prevEnabled;
      state.officeSecurity.requireApproval = prevReqApproval;
      state.officeSecurity.pin = prevPin;
      await new Promise((resolve) => testServer.close(resolve));
    }
  });

  it('rejects arbitrary .local LAN origins in CORS validator', (t, done) => {
    const validator = createCorsOriginValidator(5050);
    validator('http://attacker-laptop.local:8080', (err, allow) => {
      assert.ok(err);
      assert.equal(allow, false);
      done();
    });
  });

  it('prevents device-id header spoofing when held by another active IP', () => {
    registerActiveDeviceIp('dev_alice_bound', '192.168.1.25');
    try {
      const spoofReq = {
        socket: { remoteAddress: '192.168.1.99' },
        headers: { 'x-airbridge-device-id': 'dev_alice_bound' },
        query: {},
      };
      assert.equal(getClientDeviceId(spoofReq), null);

      const legitReq = {
        socket: { remoteAddress: '192.168.1.25' },
        headers: { 'x-airbridge-device-id': 'dev_alice_bound' },
        query: {},
      };
      assert.equal(getClientDeviceId(legitReq), 'dev_alice_bound');
    } finally {
      unregisterActiveDeviceIp('dev_alice_bound', '192.168.1.25');
    }
  });

  it('enforces WebSocket upgrade PIN lockout and withholds broadcasts/PIN from pending peers', async () => {
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const port = server.address().port;

    const state = stateStore.getState();
    const prevEnabled = state.officeSecurity.enabled;
    const prevReqApproval = state.officeSecurity.requireApproval;
    const prevPin = state.officeSecurity.pin;
    const prevApproved = [...(state.approvedDevices || [])];

    let pendingWs = null;
    try {
      resetPinAttempts('127.0.0.1');
      state.officeSecurity.enabled = true;
      state.officeSecurity.pin = '2468';
      state.officeSecurity.requireApproval = true;
      state.approvedDevices = [];

      // 5 failed WebSocket upgrade attempts using wrong query PIN must lock out with 429
      for (let i = 0; i < 5; i++) {
        await new Promise((resolve) => {
          const wsFail = new WebSocket(`ws://127.0.0.1:${port}/ws?pin=0000`, {
            headers: { 'x-airbridge-simulated-peer': 'true' },
          });
          wsFail.on('unexpected-response', (_req, res) => {
            assert.equal(res.statusCode, 401);
            res.resume();
            resolve();
          });
          wsFail.on('error', () => resolve());
        });
      }

      await new Promise((resolve) => {
        const wsLocked = new WebSocket(`ws://127.0.0.1:${port}/ws?pin=2468`, {
          headers: { 'x-airbridge-simulated-peer': 'true' },
        });
        wsLocked.on('unexpected-response', (_req, res) => {
          assert.equal(res.statusCode, 429);
          res.resume();
          resolve();
        });
        wsLocked.on('error', () => resolve());
      });

      resetPinAttempts('127.0.0.1');

      // Connect with valid PIN while pending host approval -> must not receive clipboard_sync or PIN
      const receivedTypes = [];
      let leakedPin = false;
      pendingWs = new WebSocket(`ws://127.0.0.1:${port}/ws?id=dev_pending_ws&pin=2468`, {
        headers: { 'x-airbridge-simulated-peer': 'true' },
      });

      await new Promise((resolve, reject) => {
        const t = setTimeout(() => reject(new Error('Timed out waiting for auth_required')), 3000);
        pendingWs.on('message', (raw) => {
          const msg = JSON.parse(raw.toString());
          receivedTypes.push(msg.type);
          if (msg.officeSecurity && msg.officeSecurity.pin) leakedPin = true;
          if (msg.type === 'auth_required') {
            clearTimeout(t);
            resolve();
          }
        });
        pendingWs.on('unexpected-response', (_req, res) => {
          clearTimeout(t);
          reject(new Error(`Unexpected HTTP status ${res.statusCode}`));
        });
        pendingWs.on('error', (err) => {
          clearTimeout(t);
          reject(err);
        });
      });

      // Trigger clipboard and security update via host -> pending socket must not see clipboard or PIN
      const { broadcast } = require('../index');
      broadcast({ type: 'clipboard_sync', payload: { id: 'c1', text: 'secret-token' } });
      broadcast({ type: 'office_security_updated', officeSecurity: { enabled: true, pin: '2468', requireApproval: true } });

      await new Promise((r) => setTimeout(r, 150));
      assert.equal(receivedTypes.includes('clipboard_sync'), false);
      assert.equal(leakedPin, false);
    } finally {
      if (pendingWs) {
        try { pendingWs.terminate(); } catch (_) {}
      }
      state.officeSecurity.enabled = prevEnabled;
      state.officeSecurity.requireApproval = prevReqApproval;
      state.officeSecurity.pin = prevPin;
      state.approvedDevices = prevApproved;
      state.pendingApprovalRequests = [];
      resetPinAttempts('127.0.0.1');
      if (typeof server.closeAllConnections === 'function') server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
    }
  });

  it('enforces download quotas cleanly, blocks ZIP/delete bypasses on targeted files, and sandboxes raw HTML/SVG', async () => {
    const testServer = http.createServer(app);
    await new Promise((resolve) => testServer.listen(0, '127.0.0.1', resolve));
    const baseUrl = `http://127.0.0.1:${testServer.address().port}`;

    const state = stateStore.getState();
    const prevEnabled = state.officeSecurity.enabled;
    const prevReqApproval = state.officeSecurity.requireApproval;
    state.officeSecurity.enabled = false;
    state.officeSecurity.requireApproval = false;

    const secretFile = path.join(UPLOADS_DIR, 'private_contract_test.txt');
    const svgFile = path.join(UPLOADS_DIR, 'malicious_preview_test.svg');
    fs.writeFileSync(secretFile, '0123456789ABCDEF');
    fs.writeFileSync(svgFile, '<svg onload="alert(1)"></svg>');

    try {
      stateStore.setTargetedFile('private_contract_test.txt', {
        recipientIds: ['dev_alice'],
        maxDownloads: 1,
        downloadCount: 0,
        expiresAt: Date.now() + 60000,
      });

      // Unauthorized peer cannot download via /files-ranged, /download-zip, or delete it
      const eveRanged = await fetch(`${baseUrl}/api/files-ranged/private_contract_test.txt`, {
        headers: {
          'x-airbridge-device-id': 'dev_eve',
          'x-airbridge-simulated-peer': 'true',
          Range: 'bytes=0-3',
        },
      });
      assert.equal(eveRanged.status, 403);

      const eveDelete = await fetch(`${baseUrl}/api/files/delete`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-airbridge-device-id': 'dev_eve',
          'x-airbridge-simulated-peer': 'true',
        },
        body: JSON.stringify({ filename: 'private_contract_test.txt' }),
      });
      assert.equal(eveDelete.status, 403);
      assert.equal(fs.existsSync(secretFile), true);

      const eveZip = await fetch(`${baseUrl}/api/download-zip`, {
        headers: {
          'x-airbridge-device-id': 'dev_eve',
          'x-airbridge-simulated-peer': 'true',
        },
      });
      assert.equal(eveZip.status, 200);
      const zipBuf = Buffer.from(await eveZip.arrayBuffer());
      assert.equal(zipBuf.includes(Buffer.from('private_contract_test.txt')), false);

      // Authorized recipient dev_alice can download multiple byte ranges under 1 credit lease
      const aliceRange1 = await fetch(`${baseUrl}/api/files-ranged/private_contract_test.txt`, {
        headers: {
          'x-airbridge-device-id': 'dev_alice',
          'x-airbridge-simulated-peer': 'true',
          Range: 'bytes=0-3',
        },
      });
      assert.equal(aliceRange1.status, 206);
      assert.equal(await aliceRange1.text(), '0123');

      const aliceRange2 = await fetch(`${baseUrl}/api/files-ranged/private_contract_test.txt`, {
        headers: {
          'x-airbridge-device-id': 'dev_alice',
          'x-airbridge-simulated-peer': 'true',
          Range: 'bytes=4-7',
        },
      });
      assert.equal(aliceRange2.status, 206);
      assert.equal(await aliceRange2.text(), '4567');

      const metaAfterRanges = stateStore.getTargetedFile('private_contract_test.txt');
      assert.equal(metaAfterRanges.downloadCount, 1);

      // Untargeted raw SVG preview must force sandbox CSP & attachment disposition
      const rawSvgRes = await fetch(`${baseUrl}/api/files-raw/malicious_preview_test.svg`);
      assert.equal(rawSvgRes.status, 200);
      assert.ok((rawSvgRes.headers.get('content-security-policy') || '').includes('sandbox'));
      assert.ok((rawSvgRes.headers.get('content-disposition') || '').includes('attachment'));
    } finally {
      state.officeSecurity.enabled = prevEnabled;
      state.officeSecurity.requireApproval = prevReqApproval;
      stateStore.removeTargetedFile('private_contract_test.txt');
      try { fs.unlinkSync(secretFile); } catch (_) {}
      try { fs.unlinkSync(svgFile); } catch (_) {}
      await new Promise((resolve) => testServer.close(resolve));
    }
  });

  it('rejects malformed fileId and out-of-bounds chunk parameters on parallel/chunk uploads', async () => {
    const testServer = http.createServer(app);
    await new Promise((resolve) => testServer.listen(0, '127.0.0.1', resolve));
    const baseUrl = `http://127.0.0.1:${testServer.address().port}`;

    try {
      const form1 = new FormData();
      form1.append('fileId', '!!!'); // strips down to empty
      form1.append('chunkIndex', '0');
      form1.append('totalChunks', '1');
      form1.append('filename', 'bad.bin');
      form1.append('chunk', new Blob(['hello']), 'bad.bin');

      const badIdRes = await fetch(`${baseUrl}/api/upload-parallel`, { method: 'POST', body: form1 });
      assert.equal(badIdRes.status, 400);

      const form2 = new FormData();
      form2.append('fileId', 'valid_file_1234');
      form2.append('chunkIndex', '-1');
      form2.append('totalChunks', '2');
      form2.append('filename', 'bad.bin');
      form2.append('chunk', new Blob(['hello']), 'bad.bin');

      const badIdxRes = await fetch(`${baseUrl}/api/upload-parallel`, { method: 'POST', body: form2 });
      assert.equal(badIdxRes.status, 400);
    } finally {
      await new Promise((resolve) => testServer.close(resolve));
    }
  });
});
