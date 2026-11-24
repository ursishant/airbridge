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
      },
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
    if (this.legacyUploadsDir && !fs.existsSync(this.stateFilePath)) {
      const legacyPath = path.join(this.legacyUploadsDir, '.airbridge_state.json');
      if (fs.existsSync(legacyPath)) {
        try {
          const rawLegacy = fs.readFileSync(legacyPath, 'utf8');
          fs.writeFileSync(this.stateFilePath, rawLegacy, { mode: 0o600 });
          try {
            fs.unlinkSync(legacyPath);
          } catch (_) {}
          console.log('[StateStore] Migrated legacy state file from uploads directory to:', this.stateFilePath);
        } catch (err) {
          console.warn('[StateStore] Failed to migrate legacy state:', err.message);
        }
      }
    }

    // Load state from file
    if (fs.existsSync(this.stateFilePath)) {
      try {
        const raw = fs.readFileSync(this.stateFilePath, 'utf8');
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed.chatHistory)) this.state.chatHistory = parsed.chatHistory;
        if (Array.isArray(parsed.clipboardHistory)) this.state.clipboardHistory = parsed.clipboardHistory;
        if (Array.isArray(parsed.knownDevices)) this.state.knownDevices = parsed.knownDevices;
        if (parsed.officeSecurity && typeof parsed.officeSecurity === 'object') {
          this.state.officeSecurity.enabled = Boolean(parsed.officeSecurity.enabled);
          if (parsed.officeSecurity.pin) {
            this.state.officeSecurity.pin = String(parsed.officeSecurity.pin);
          }
        }
        console.log(`[StateStore] Loaded state: ${this.state.chatHistory.length} chats, ${this.state.clipboardHistory.length} clipboard items.`);
      } catch (err) {
        console.error('[StateStore] Error reading state file, starting fresh:', err.message);
      }
    }
  }

  getState() {
    return this.state;
  }

  /**
   * Serialized atomic async write:
   * 1. Chains onto internal writeQueue promise.
   * 2. Writes to temporary file in same directory.
   * 3. Sets permissions (0o600).
   * 4. Uses atomic fs.promises.rename.
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
          officeSecurity: {
            enabled: Boolean(this.state.officeSecurity?.enabled),
            pin: String(this.state.officeSecurity?.pin || ''),
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
