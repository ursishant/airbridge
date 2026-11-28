const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { WebSocket } = require('ws');
const { server, stateStore } = require('../index');

describe('Customizable Room Settings & Member Limit Enforcement', () => {
  it('enforces host-only /api/office/room-settings and WebSocket maxParticipants cap', async () => {
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const port = server.address().port;
    const baseUrl = `http://127.0.0.1:${port}`;

    const state = stateStore.getState();
    const prevSettings = { ...(state.roomSettings || {}) };
    const prevSec = state.officeSecurity.enabled;

    let ws1 = null;
    let ws2 = null;
    let ws3 = null;

    try {
      state.officeSecurity.enabled = false;

      // 1. Non-host peer cannot change room settings
      const peerSettingsRes = await fetch(`${baseUrl}/api/office/room-settings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-airbridge-simulated-peer': 'true',
        },
        body: JSON.stringify({ roomName: 'Hacked Room', maxParticipants: 1 }),
      });
      assert.equal(peerSettingsRes.status, 403);

      // 2. Host customizes room name, limit = 1, and permissions
      const hostRes = await fetch(`${baseUrl}/api/office/room-settings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          roomName: 'Design Studio',
          maxParticipants: 1,
          allowUploads: true,
          allowChat: true,
          allowClipboard: true,
        }),
      });
      assert.equal(hostRes.status, 200);
      const hostData = await hostRes.json();
      assert.equal(hostData.roomSettings.roomName, 'Design Studio');
      assert.equal(hostData.roomSettings.maxParticipants, 1);

      // 3. First device joins successfully
      ws1 = await new Promise((resolve, reject) => {
        const sock = new WebSocket(`ws://127.0.0.1:${port}/ws?id=dev_room_p1&name=Peer1`, {
          headers: { 'x-airbridge-simulated-peer': 'true' },
        });
        sock.on('message', (raw) => {
          const msg = JSON.parse(raw.toString());
          if (msg.type === 'init') resolve(sock);
        });
        sock.on('error', reject);
      });

      // 4. Second device is rejected with room_full and close code 4003
      const rejected = await new Promise((resolve) => {
        let gotRoomFullMsg = false;
        ws2 = new WebSocket(`ws://127.0.0.1:${port}/ws?id=dev_room_p2&name=Peer2`, {
          headers: { 'x-airbridge-simulated-peer': 'true' },
        });
        ws2.on('message', (raw) => {
          const msg = JSON.parse(raw.toString());
          if (msg.type === 'room_full') {
            gotRoomFullMsg = true;
            assert.equal(msg.maxParticipants, 1);
          }
        });
        ws2.on('close', (code) => {
          resolve({ gotRoomFullMsg, code });
        });
      });
      assert.equal(rejected.gotRoomFullMsg, true);
      assert.equal(rejected.code, 4003);

      // 5. Host raises limit to 2; second device can now join
      const raiseRes = await fetch(`${baseUrl}/api/office/room-settings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ maxParticipants: 2 }),
      });
      assert.equal(raiseRes.status, 200);

      ws3 = await new Promise((resolve, reject) => {
        const sock = new WebSocket(`ws://127.0.0.1:${port}/ws?id=dev_room_p2&name=Peer2`, {
          headers: { 'x-airbridge-simulated-peer': 'true' },
        });
        sock.on('message', (raw) => {
          const msg = JSON.parse(raw.toString());
          if (msg.type === 'init') resolve(sock);
        });
        sock.on('error', reject);
      });
      assert.ok(ws3);
    } finally {
      try { ws1?.close(); } catch (_) {}
      try { ws2?.close(); } catch (_) {}
      try { ws3?.close(); } catch (_) {}
      state.officeSecurity.enabled = prevSec;
      state.roomSettings = {
        roomName: prevSettings.roomName || 'AirBridge Room',
        maxParticipants: prevSettings.maxParticipants || 0,
        allowUploads: prevSettings.allowUploads !== false,
        allowChat: prevSettings.allowChat !== false,
        allowClipboard: prevSettings.allowClipboard !== false,
      };
      await new Promise((resolve) => server.close(resolve));
    }
  });
});
