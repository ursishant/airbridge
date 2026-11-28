const express = require('express');
const {
  isHostRequest,
  recordFailedPinAttempt,
  resetPinAttempts,
  getPinLockoutInfo,
  verifyPinTimingSafe,
  issueSession,
  getNormalizedRemoteAddress,
  getClientDeviceId,
} = require('../middleware/auth');

function createOfficeRouter(options) {
  const router = express.Router();
  const { stateStore, broadcast, isRoomFullForDevice, kickDeviceById } = options;

  // Check approval status (polled by waiting peer devices)
  router.get('/approval-status', (req, res) => {
    const state = stateStore.getState();
    const isSimulatedPeer = Boolean(req.headers['x-airbridge-simulated-peer'] || (req.query && req.query.simulatePeer === '1'));
    const isHost = isHostRequest(req) && !isSimulatedPeer;

    if (!state.officeSecurity?.enabled || !state.officeSecurity?.requireApproval || isHost) {
      return res.json({ approved: true, pending: false });
    }

    const deviceId = getClientDeviceId(req);
    const approvedList = Array.isArray(state.approvedDevices) ? state.approvedDevices : [];
    const isApproved = Boolean(deviceId && approvedList.includes(deviceId));

    return res.json({
      approved: isApproved,
      pending: !isApproved,
      deviceId,
    });
  });

  // Strict PIN verification & Approval check
  router.post('/verify-pin', async (req, res) => {
    const ip = getNormalizedRemoteAddress(req);
    const lockout = getPinLockoutInfo(ip);

    if (lockout.locked) {
      return res.status(429).json({
        error: `Too many PIN verification attempts. Please wait ${lockout.waitSeconds} seconds.`,
        locked: true,
        waitSeconds: lockout.waitSeconds,
      });
    }

    const state = stateStore.getState();
    const rawPin = req.body && req.body.pin !== undefined ? String(req.body.pin).trim() : '';
    const deviceId = (req.body && req.body.deviceId ? String(req.body.deviceId).trim() : null) || getClientDeviceId(req);
    const deviceName = (req.body && req.body.deviceName ? String(req.body.deviceName).trim() : null) || 'Colleague Device';
    // For approval gating, if explicit isSimulatedPeer flag is provided in testing or remote header
    const isSimulatedPeer = Boolean(req.headers['x-airbridge-simulated-peer'] || (req.query && req.query.simulatePeer === '1'));
    const isHost = isHostRequest(req) && !isSimulatedPeer;

    if (typeof isRoomFullForDevice === 'function') {
      const capacity = isRoomFullForDevice(deviceId, isHost);
      if (capacity && capacity.full) {
        return res.status(403).json({
          error: `Room is full (${capacity.currentCount}/${capacity.maxParticipants} people joined)`,
          roomFull: true,
          maxParticipants: capacity.maxParticipants,
          currentCount: capacity.currentCount,
        });
      }
    }

    if (!state.officeSecurity?.enabled) {
      const token = issueSession(ip, deviceId);
      res.cookie('airbridge_session', token, {
        httpOnly: true,
        sameSite: 'strict',
        maxAge: 24 * 60 * 60 * 1000,
      });
      return res.json({ success: true, enabled: false, token, deviceId });
    }

    if (verifyPinTimingSafe(rawPin, state.officeSecurity.pin)) {
      resetPinAttempts(ip);

      // If host has enabled "Require Approval" for non-host peers:
      if (state.officeSecurity.requireApproval && !isHost) {
        const approvedList = Array.isArray(state.approvedDevices) ? state.approvedDevices : [];
        if (deviceId && approvedList.includes(deviceId)) {
          // Already approved!
          const token = issueSession(ip, deviceId);
          res.cookie('airbridge_session', token, {
            httpOnly: true,
            sameSite: 'strict',
            maxAge: 24 * 60 * 60 * 1000,
          });
          return res.json({ success: true, enabled: true, approved: true, token, deviceId });
        }

        // Register pending approval request and notify host via WebSocket
        if (deviceId) {
          if (!Array.isArray(state.pendingApprovalRequests)) {
            state.pendingApprovalRequests = [];
          }
          const existing = state.pendingApprovalRequests.find(r => r.id === deviceId);
          if (!existing) {
            state.pendingApprovalRequests.push({
              id: deviceId,
              name: deviceName,
              ip,
              requestedAt: Date.now(),
            });
          } else {
            existing.name = deviceName;
            existing.ip = ip;
            existing.requestedAt = Date.now();
          }
          await stateStore.save();
          broadcast({
            type: 'device_approval_requested',
            device: {
              id: deviceId,
              name: deviceName,
              ip,
              requestedAt: Date.now(),
            },
          });
        }

        return res.json({
          success: true,
          enabled: true,
          pendingApproval: true,
          deviceId,
          message: 'PIN verified. Waiting for host approval.',
        });
      }

      // Standard PIN success
      const token = issueSession(ip, deviceId);
      res.cookie('airbridge_session', token, {
        httpOnly: true,
        sameSite: 'strict',
        maxAge: 24 * 60 * 60 * 1000,
      });
      return res.json({ success: true, enabled: true, approved: true, token, deviceId });
    }

    const updatedLockout = recordFailedPinAttempt(ip);
    if (updatedLockout.failedAttempts >= 5) {
      return res.status(429).json({
        error: 'Too many PIN verification attempts. Please wait 15 minutes.',
        locked: true,
        remainingAttempts: 0,
      });
    }

    return res.status(401).json({
      error: 'Incorrect Room PIN',
      success: false,
      remainingAttempts: Math.max(0, 5 - updatedLockout.failedAttempts),
    });
  });

  // Host Endpoint: Approve or Deny a connecting colleague device
  router.post('/approve-device', async (req, res) => {
    if (!isHostRequest(req)) {
      return res.status(403).json({ error: 'Only the host machine can approve devices' });
    }

    const { deviceId, approved } = req.body || {};
    if (!deviceId || typeof deviceId !== 'string') {
      return res.status(400).json({ error: 'Missing deviceId' });
    }

    const state = stateStore.getState();
    if (!Array.isArray(state.approvedDevices)) state.approvedDevices = [];
    if (!Array.isArray(state.pendingApprovalRequests)) state.pendingApprovalRequests = [];

    state.pendingApprovalRequests = state.pendingApprovalRequests.filter(r => r.id !== deviceId);

    if (approved) {
      if (!state.approvedDevices.includes(deviceId)) {
        state.approvedDevices.push(deviceId);
      }
    } else {
      state.approvedDevices = state.approvedDevices.filter(id => id !== deviceId);
    }

    await stateStore.save();

    broadcast({
      type: 'device_approval_resolved',
      deviceId,
      approved: Boolean(approved),
    });

    res.json({ success: true, approved: Boolean(approved), deviceId });
  });

  // Host Endpoint: Remove an approved device
  router.post('/revoke-device', async (req, res) => {
    if (!isHostRequest(req)) {
      return res.status(403).json({ error: 'Only the host machine can revoke devices' });
    }

    const { deviceId } = req.body || {};
    if (!deviceId) return res.status(400).json({ error: 'Missing deviceId' });

    const state = stateStore.getState();
    state.approvedDevices = (state.approvedDevices || []).filter(id => id !== deviceId);
    await stateStore.save();

    broadcast({
      type: 'device_revoked',
      deviceId,
    });

    res.json({ success: true, revoked: deviceId });
  });

  // Configure Office Security (Strictly host-only)
  router.post('/configure', async (req, res) => {
    if (!isHostRequest(req)) {
      return res.status(403).json({ error: 'Only the host machine can configure office security' });
    }

    const state = stateStore.getState();
    const { enabled, regenerate, pin, requireApproval } = req.body || {};

    if (typeof enabled === 'boolean') {
      state.officeSecurity.enabled = enabled;
      if (!enabled) {
        state.officeSecurity.requireApproval = false;
        state.pendingApprovalRequests = [];
      }
    }

    if (typeof requireApproval === 'boolean') {
      state.officeSecurity.requireApproval = requireApproval;
    }

    if (regenerate || !state.officeSecurity.pin) {
      state.officeSecurity.pin = Math.floor(1000 + Math.random() * 9000).toString();
    } else if (pin && typeof pin === 'string') {
      const raw = pin.trim().replace(/[^0-9]/g, '').slice(0, 8);
      const num = parseInt(raw, 10);
      if (!isNaN(num) && num >= 1000) {
        state.officeSecurity.pin = String(num);
      }
    }

    await stateStore.save();

    broadcast({
      type: 'office_security_updated',
      officeSecurity: {
        enabled: state.officeSecurity.enabled,
        pin: state.officeSecurity.pin,
        requireApproval: state.officeSecurity.requireApproval,
      },
      approvedCount: (state.approvedDevices || []).length,
    });

    res.json({
      success: true,
      officeSecurity: state.officeSecurity,
      approvedDevices: state.approvedDevices,
    });
  });

  // Update customizable Room Settings (Room Name, Member Limit, Permissions) - strictly host-only
  router.post('/room-settings', async (req, res) => {
    if (!isHostRequest(req)) {
      return res.status(403).json({ error: 'Only the host machine can customize room settings' });
    }

    const state = stateStore.getState();
    if (!state.roomSettings || typeof state.roomSettings !== 'object') {
      state.roomSettings = {
        roomName: 'AirBridge Room',
        maxParticipants: 0,
        allowUploads: true,
        allowChat: true,
        allowClipboard: true,
      };
    }

    const { roomName, maxParticipants, allowUploads, allowChat, allowClipboard } = req.body || {};

    if (typeof roomName === 'string') {
      const cleanName = roomName.trim().slice(0, 40);
      if (cleanName) state.roomSettings.roomName = cleanName;
    }

    if (maxParticipants !== undefined && maxParticipants !== null) {
      const parsed = parseInt(maxParticipants, 10);
      if (isNaN(parsed) || parsed < 0 || parsed > 100) {
        return res.status(400).json({ error: 'maxParticipants must be between 0 (unlimited) and 100' });
      }
      state.roomSettings.maxParticipants = parsed;
    }

    if (typeof allowUploads === 'boolean') state.roomSettings.allowUploads = allowUploads;
    if (typeof allowChat === 'boolean') state.roomSettings.allowChat = allowChat;
    if (typeof allowClipboard === 'boolean') state.roomSettings.allowClipboard = allowClipboard;

    await stateStore.save();

    broadcast({
      type: 'room_settings_updated',
      roomSettings: state.roomSettings,
    });

    res.json({
      success: true,
      roomSettings: state.roomSettings,
    });
  });

  // Kick/Disconnect a connected peer from the room (Host-only)
  router.post('/kick-device', async (req, res) => {
    if (!isHostRequest(req)) {
      return res.status(403).json({ error: 'Only the host machine can remove participants' });
    }

    const { deviceId } = req.body || {};
    if (!deviceId || typeof deviceId !== 'string') {
      return res.status(400).json({ error: 'Missing deviceId' });
    }

    const state = stateStore.getState();
    state.approvedDevices = (state.approvedDevices || []).filter(id => id !== deviceId);
    state.pendingApprovalRequests = (state.pendingApprovalRequests || []).filter(r => r.id !== deviceId);
    await stateStore.save();

    if (typeof kickDeviceById === 'function') {
      kickDeviceById(deviceId);
    }

    broadcast({
      type: 'device_revoked',
      deviceId,
    });

    res.json({ success: true, kicked: deviceId });
  });

  return router;
}

module.exports = { createOfficeRouter };
