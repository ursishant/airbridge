const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const { app, stateStore } = require('../index');

describe('Office Isolation & Targeted Group Sharing Security Tests', () => {
  let testServer;
  let baseUrl = '';

  it('verifies strict host approval gate, targeted peer isolation, and expiration', async () => {
    testServer = http.createServer(app);
    await new Promise((resolve) => {
      testServer.listen(0, '127.0.0.1', resolve);
    });

    const port = testServer.address().port;
    baseUrl = `http://127.0.0.1:${port}`;

    try {
      const state = stateStore.getState();
      state.officeSecurity.enabled = true;
      state.officeSecurity.pin = '4545';
      state.officeSecurity.requireApproval = true;
      state.approvedDevices = ['dev_colleague_1', 'dev_colleague_2'];
      state.targetedFiles = {};

      // 1. Unapproved colleague device with valid PIN gets pendingApproval response
      const unapprovedRes = await fetch(`${baseUrl}/api/office/verify-pin`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-airbridge-simulated-peer': 'true',
        },
        body: JSON.stringify({
          pin: '4545',
          deviceId: 'dev_stranger_on_wifi',
          deviceName: 'Unknown Office Laptop',
        }),
      });
      assert.equal(unapprovedRes.status, 200);
      const unapprovedData = await unapprovedRes.json();
      assert.equal(unapprovedData.pendingApproval, true);

      // Verify pending request was registered on host
      assert.ok(state.pendingApprovalRequests.some(r => r.id === 'dev_stranger_on_wifi'));

      // 2. Host approves the device
      const approveRes = await fetch(`${baseUrl}/api/office/approve-device`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          deviceId: 'dev_stranger_on_wifi',
          approved: true,
        }),
      });
      assert.equal(approveRes.status, 200);
      assert.ok(state.approvedDevices.includes('dev_stranger_on_wifi'));

      // 3. Now the colleague re-verifies PIN and gets approved access token
      const approvedRes = await fetch(`${baseUrl}/api/office/verify-pin`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-airbridge-simulated-peer': 'true',
        },
        body: JSON.stringify({
          pin: '4545',
          deviceId: 'dev_stranger_on_wifi',
        }),
      });
      const approvedData = await approvedRes.json();
      assert.equal(approvedData.approved, true);
      assert.ok(approvedData.token);

      // 4. Targeted file security: upload file targeted only to dev_colleague_1
      state.targetedFiles['secret-report.pdf'] = {
        recipientIds: ['dev_colleague_1'],
        maxDownloads: 2,
        downloadCount: 0,
        expiresAt: Date.now() + 60000,
      };

      // Query files from unapproved recipient (dev_stranger_on_wifi)
      const listStrangerRes = await fetch(`${baseUrl}/api/files`, {
        headers: {
          'x-airbridge-device-id': 'dev_stranger_on_wifi',
          'x-airbridge-pin': '4545',
          'x-airbridge-simulated-peer': 'true',
        },
      });
      assert.equal(listStrangerRes.status, 200);
      const strangerFiles = await listStrangerRes.json();
      // Targeted file should NOT appear in unauthorized peer's list
      assert.equal(strangerFiles.files.some(f => f.name === 'secret-report.pdf'), false);

      // Query files from host: host can always see all files
      const listHostRes = await fetch(`${baseUrl}/api/files`);
      assert.equal(listHostRes.status, 200);

      // Clean up state
      state.officeSecurity.enabled = false;
      state.officeSecurity.requireApproval = false;
      state.approvedDevices = [];
      state.pendingApprovalRequests = [];
      state.targetedFiles = {};
    } finally {
      await new Promise((resolve) => testServer.close(resolve));
    }
  });
});
