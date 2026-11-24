const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const { app, stateStore } = require('../index');

describe('API & WebSocket Integration Tests', () => {
  it('runs integration tests against an isolated server instance', async () => {
    const testServer = http.createServer(app);
    await new Promise((resolve) => {
      testServer.listen(0, '127.0.0.1', resolve);
    });

    const port = testServer.address().port;
    const baseUrl = `http://127.0.0.1:${port}`;

    try {
      // 1. GET /api/info
      const res = await fetch(`${baseUrl}/api/info`);
      assert.equal(res.status, 200);
      const data = await res.json();
      assert.ok(data.hostname);
      assert.equal(data.isHost, true);
      assert.equal(typeof data.officeSecurity.enabled, 'boolean');

      // 2. Office Security PIN verification
      const state = stateStore.getState();
      const prevEnabled = state.officeSecurity.enabled;
      const testPin = '9191';

      state.officeSecurity.enabled = true;
      state.officeSecurity.pin = testPin;

      const badRes = await fetch(`${baseUrl}/api/office/verify-pin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin: '0000' }),
      });
      assert.equal(badRes.status, 401);

      const goodRes = await fetch(`${baseUrl}/api/office/verify-pin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin: testPin }),
      });
      assert.equal(goodRes.status, 200);
      const goodData = await goodRes.json();
      assert.equal(goodData.success, true);
      assert.ok(goodData.token);

      state.officeSecurity.enabled = prevEnabled;
    } finally {
      await new Promise((resolve) => testServer.close(resolve));
    }
  });
});
