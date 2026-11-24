const express = require('express');

function createChatRouter(options) {
  const router = express.Router();
  const { stateStore, broadcast } = options;

  router.get('/', (req, res) => {
    const state = stateStore.getState();
    res.json({ messages: state.chatHistory });
  });

  router.post('/clear', async (req, res) => {
    const state = stateStore.getState();
    state.chatHistory = [];
    await stateStore.save();
    broadcast({ type: 'chat_cleared' });
    res.json({ success: true });
  });

  return router;
}

module.exports = { createChatRouter };
