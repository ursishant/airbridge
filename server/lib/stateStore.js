const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

/**
 * Resolves standard OS Application Support directory for AirBridge
 * macOS: ~/Library/Application Support/AirBridge
 * Windows: %APPDATA%/AirBridge (or ~/AppData/Roaming/AirBridge)
 * Linux: ~/.config/airbridge (or $XDG_CONFIG_HOME/airbridge)
 */
function getAppDataDir() {
  if (process.env.AIRBRIDGE_DATA_DIR) {
    return path.resolve(process.env.AIRBRIDGE_DATA_DIR);
  }

  const home = os.homedir();
  if (process.platform === 'darwin') {
    return path.join(home, 'Library', 'Application Support', 'AirBridge');
  }
  if (process.platform === 'win32') {
    const appData = process.env.APPDATA || path.join(home, 'AppData', 'Roaming');
    return path.join(appData, 'AirBridge');
  }
  const xdgConfig = process.env.XDG_CONFIG_HOME || path.join(home, '.config');
  return path.join(xdgConfig, 'airbridge');
}

class StateStore {
  constructor(options = {}) {
    this.appDataDir = options.appDataDir || getAppDataDir();
    this.stateFilePath = path.join(this.appDataDir, '.airbridge_state.json');
    this.legacyUploadsDir = options.legacyUploadsDir || null;

    this.state = {
      chatHistory: [],
      clipboardHistory: [],
      knownDevices: [],
      officeSecurity: {
        enabled: false,
        pin: String(Math.floor(1000 + Math.random() * 9000)),
        requireApproval: false, // When true, host must explicitly approve each non-host peer
      },
      approvedDevices: [], // Array of approved device IDs: ['dev_xxx', ...]
      pendingApprovalRequests: [], // Array of pending requests: [{ id, name, ip, os, requestedAt }]
      targetedFiles: Object.create(null), // Maps filename -> { recipientIds: string[], maxDownloads?: number, downloadCount: number, expiresAt?: number }
    };

    this.writeQueue = Promise.resolve();
    this.init();
  }

  init() {
    try {
      if (!fs.existsSync(this.appDataDir)) {
        fs.mkdirSync(this.appDataDir, { recursive: true, mode: 0o700 });
      }
    } catch (e) {
      console.error('[StateStore] Failed to create appDataDir:', e.message);
    }

    // One-time automatic migration from legacy uploads directory if present
    if (this.legacyUploadsDir) {
      const legacyPath = path.join(this.legacyUploadsDir, '.airbridge_state.json');
      try {
        const rawLegacy = fs.readFileSync(legacyPath, 'utf8');
        fs.writeFileSync(this.stateFilePath, rawLegacy, { mode: 0o600, flag: 'wx' });
        try {
          fs.unlinkSync(legacyPath);
        } catch (_) {}
        console.log('[StateStore] Migrated legacy state file from uploads directory to:', this.stateFilePath);
      } catch (err) {
        if (err.code !== 'ENOENT' && err.code !== 'EEXIST') {
          console.warn('[StateStore] Failed to migrate legacy state:', err.message);
        }
      }
    }

    // Load state from file
    try {
      const raw = fs.readFileSync(this.stateFilePath, 'utf8');
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed.chatHistory)) this.state.chatHistory = parsed.chatHistory;
      if (Array.isArray(parsed.clipboardHistory)) this.state.clipboardHistory = parsed.clipboardHistory;
      if (Array.isArray(parsed.knownDevices)) this.state.knownDevices = parsed.knownDevices;
      if (Array.isArray(parsed.approvedDevices)) this.state.approvedDevices = parsed.approvedDevices;
      if (parsed.targetedFiles && typeof parsed.targetedFiles === 'object') {
        this.state.targetedFiles = Object.create(null);
        for (const [k, v] of Object.entries(parsed.targetedFiles)) {
          if (k !== '__proto__' && k !== 'constructor' && k !== 'prototype') {
            this.state.targetedFiles[k] = v;
          }
        }
      }
      if (parsed.officeSecurity && typeof parsed.officeSecurity === 'object') {
        this.state.officeSecurity.enabled = Boolean(parsed.officeSecurity.enabled);
        if (parsed.officeSecurity.pin) {
          this.state.officeSecurity.pin = String(parsed.officeSecurity.pin);
        }
        this.state.officeSecurity.requireApproval = Boolean(parsed.officeSecurity.requireApproval);
      }
      console.log(`[StateStore] Loaded state: ${this.state.chatHistory.length} chats, ${this.state.clipboardHistory.length} clipboard items, ${this.state.approvedDevices.length} approved devices.`);
    } catch (err) {
      if (err.code !== 'ENOENT') {
        console.warn('[StateStore] Error reading state file, starting fresh:', err.message);
      }
    }
  }

  getState() {
    return this.state;
  }

  /**
   * Serialized atomic async write
   */
  async save() {
    this.writeQueue = this.writeQueue.then(async () => {
      try {
        if (!fs.existsSync(this.appDataDir)) {
          fs.mkdirSync(this.appDataDir, { recursive: true, mode: 0o700 });
        }

        const serialized = JSON.stringify({
          chatHistory: Array.isArray(this.state.chatHistory) ? this.state.chatHistory : [],
          clipboardHistory: Array.isArray(this.state.clipboardHistory) ? this.state.clipboardHistory : [],
          knownDevices: Array.isArray(this.state.knownDevices) ? this.state.knownDevices : [],
          approvedDevices: Array.isArray(this.state.approvedDevices) ? this.state.approvedDevices : [],
          targetedFiles: this.state.targetedFiles || {},
          officeSecurity: {
            enabled: Boolean(this.state.officeSecurity?.enabled),
            pin: String(this.state.officeSecurity?.pin || ''),
            requireApproval: Boolean(this.state.officeSecurity?.requireApproval),
          },
        }, null, 2);

        const tempFile = path.join(
          this.appDataDir,
          `.airbridge_state_${Date.now()}_${crypto.randomBytes(8).toString('hex')}.tmp`
        );

        await fs.promises.writeFile(tempFile, serialized, { mode: 0o600 });
        try {
          if (process.platform !== 'win32') {
            await fs.promises.chmod(tempFile, 0o600);
          }
        } catch (_) {}

        await fs.promises.rename(tempFile, this.stateFilePath);

        try {
          if (process.platform !== 'win32') {
            await fs.promises.chmod(this.stateFilePath, 0o600);
          }
        } catch (_) {}
      } catch (err) {
        console.error('[StateStore] Error saving persistent state:', err.message);
      }
    }).catch((err) => {
      console.error('[StateStore] Uncaught error in write queue:', err);
    });

    return this.writeQueue;
  }
}

module.exports = {
  StateStore,
  getAppDataDir,
};
