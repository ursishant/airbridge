const express = require('express');
const {
  isHostRequest,
  recordFailedPinAttempt,
  resetPinAttempts,
  getPinLockoutInfo,
  issueSession,
  getNormalizedRemoteAddress,
  getClientDeviceId,
} = require('../middleware/auth');

function createOfficeRouter(options) {
  const router = express.Router();
  const { stateStore, broadcast } = options;

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

    if (!state.officeSecurity?.enabled) {
      const token = issueSession(ip, deviceId);
      res.cookie('airbridge_session', token, {
        httpOnly: true,
        sameSite: 'strict',
        maxAge: 24 * 60 * 60 * 1000,
      });
      return res.json({ success: true, enabled: false, token, deviceId });
    }

    if (state.officeSecurity.pin && rawPin === state.officeSecurity.pin) {
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

  // Configure Office Security
  router.post('/configure', async (req, res) => {
    const state = stateStore.getState();
    const { enabled, regenerate, pin, requireApproval } = req.body || {};

    if (typeof enabled === 'boolean') {
      state.officeSecurity.enabled = enabled;
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

  return router;
}

module.exports = { createOfficeRouter };
