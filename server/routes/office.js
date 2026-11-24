const express = require('express');
const {
  isHostRequest,
  recordFailedPinAttempt,
  resetPinAttempts,
  getPinLockoutInfo,
  issueSession,
  getNormalizedRemoteAddress,
} = require('../middleware/auth');

function createOfficeRouter(options) {
  const router = express.Router();
  const { stateStore, broadcast } = options;

  // Strict PIN verification with progressive lockout
  router.post('/verify-pin', (req, res) => {
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

    if (!state.officeSecurity?.enabled) {
      const token = issueSession(ip);
      res.cookie('airbridge_session', token, {
        httpOnly: true,
        sameSite: 'strict',
        maxAge: 24 * 60 * 60 * 1000,
      });
      return res.json({ success: true, enabled: false, token });
    }

    if (state.officeSecurity.pin && rawPin === state.officeSecurity.pin) {
      resetPinAttempts(ip);
      const token = issueSession(ip);
      res.cookie('airbridge_session', token, {
        httpOnly: true,
        sameSite: 'strict',
        maxAge: 24 * 60 * 60 * 1000,
      });
      return res.json({ success: true, enabled: true, token });
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

  // Configure Office Security
  router.post('/configure', async (req, res) => {
    const state = stateStore.getState();
    const { enabled, regenerate, pin } = req.body || {};

    if (typeof enabled === 'boolean') {
      state.officeSecurity.enabled = enabled;
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
      },
    });

    res.json({ success: true, officeSecurity: state.officeSecurity });
  });

  return router;
}

module.exports = { createOfficeRouter };
