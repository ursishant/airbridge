const express = require('express');

function createClipboardRouter(options) {
  const router = express.Router();
  const { stateStore, broadcast } = options;

  router.get('/', (req, res) => {
    const state = stateStore.getState();
    res.json({ items: state.clipboardHistory });
  });

  router.post('/clear', async (req, res) => {
    const state = stateStore.getState();
    state.clipboardHistory = [];
    await stateStore.save();
    broadcast({ type: 'clipboard_cleared' });
    res.json({ success: true });
  });

  return router;
}

module.exports = { createClipboardRouter };
