const express = require('express');
const { isHostRequest, isAuthorizedRequest } = require('../middleware/auth');

function createInfoRouter(options) {
  const router = express.Router();
  const {
    getNetworkIps,
    PORT,
    getSanitizedHostname,
    isWindows,
    isMac,
    isLinux,
    getSanitizedDownloadsDir,
    getUniqueDevices,
    stateStore,
    getHostBattery,
  } = options;

  router.get('/info', (req, res) => {
    const net = getNetworkIps();
    const isHost = isHostRequest(req);
    const state = stateStore.getState();
    const isAuthed = isHost || isAuthorizedRequest(req, state);

    let osDisplay = 'macOS ' + require('os').release();
    if (isWindows) {
      osDisplay = 'Windows ' + (require('os').release().startsWith('10.0.2') ? '11' : '10');
    } else if (isLinux) {
      osDisplay = 'Linux ' + require('os').release();
    }

    res.json({
      primaryIp: net.primaryIp,
      allIps: net.allIps,
      port: PORT,
      url: `http://${net.primaryIp}:${PORT}`,
      hostname: getSanitizedHostname(),
      platform: process.platform,
      os: osDisplay,
      isWindows,
      isMac,
      isLinux,
      isHost,
      downloadsDir: getSanitizedDownloadsDir(),
      connectedCount: getUniqueDevices().length,
      officeSecurity: {
        enabled: Boolean(state.officeSecurity?.enabled),
        requiresAuth: !isAuthed,
        pin: isAuthed ? state.officeSecurity?.pin : undefined,
      },
    });
  });

  router.get('/battery', async (req, res) => {
    const battery = await getHostBattery();
    res.json({ battery });
  });

  return router;
}

module.exports = { createInfoRouter };
