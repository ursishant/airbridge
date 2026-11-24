const crypto = require('crypto');
const os = require('os');

// Per-boot cryptographically secure random secret for host-only endpoints
const BOOT_HOST_SECRET = crypto.randomBytes(32).toString('hex');

// Per-boot secret for signing session cookies / bearer tokens
const SESSION_SECRET = crypto.randomBytes(32).toString('hex');

// In-memory set or map of valid issued session tokens: token -> { issuedAt, ip }
const validSessions = new Map();

// Progressive lockout map for PIN attempts: ip -> { failedAttempts: number, lockedUntil: number }
const pinLockouts = new Map();

/**
 * Normalizes remote address to clean IP string
 */
function getNormalizedRemoteAddress(req) {
  let remote = '';
  if (req.socket && req.socket.remoteAddress) {
    remote = req.socket.remoteAddress;
  } else if (req.connection && req.connection.remoteAddress) {
    remote = req.connection.remoteAddress;
  }
  remote = String(remote || '').trim().toLowerCase();
  return remote.replace(/^::ffff:/, '');
}

/**
 * Checks if socket connection is strictly from loopback.
 * Loopback IPs: 127.0.0.1, ::1
 */
function isLoopbackAddress(ip) {
  const clean = (ip || '').toLowerCase().replace(/^::ffff:/, '');
  return clean === '127.0.0.1' || clean === '::1';
}

/**
 * Validates whether the request originated from the local host machine.
 * CRITICAL FIX:
 * - NEVER trusts req.hostname === 'localhost' or '127.0.0.1'
 * - ONLY trusts normalized loopback socket remote address (127.0.0.1, ::1)
 * - Optionally checks x-airbridge-host-token === BOOT_HOST_SECRET for privileged host endpoints
 */
function isHostRequest(req, requireToken = false) {
  const remoteIp = getNormalizedRemoteAddress(req);
  if (!isLoopbackAddress(remoteIp)) {
    return false;
  }

  if (requireToken) {
    const token = req.headers['x-airbridge-host-token'] || (req.query && req.query.hostToken);
    return token === BOOT_HOST_SECRET;
  }

  return true;
}

/**
 * Helper to get all bound server host IPs and ports for CORS origin verification
 */
function getHostAddresses() {
  const ips = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);
  try {
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
      for (const iface of interfaces[name]) {
        if (iface.address) {
          ips.add(iface.address.toLowerCase());
        }
      }
    }
  } catch (_) {}
  return ips;
}

/**
 * Strict CORS origin validator:
 * Allows requests with no origin (e.g. mobile apps, curl, native browser navigation, same-origin)
 * If Origin header is present, origin must be http or https AND host must match server's bound IPs/hostname.
 */
function createCorsOriginValidator(serverPort) {
  return function validateOrigin(origin, callback) {
    if (!origin) {
      return callback(null, true);
    }

    try {
      const parsed = new URL(origin);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        return callback(new Error('Origin protocol not allowed'), false);
      }

      const host = parsed.hostname.toLowerCase();
      const hostAddresses = getHostAddresses();

      if (hostAddresses.has(host) || host === 'localhost' || host.endsWith('.local')) {
        return callback(null, true);
      }

      return callback(new Error('CORS rejected: untrusted external origin'), false);
    } catch (e) {
      return callback(new Error('Invalid Origin header'), false);
    }
  };
}

/**
 * Parses cookies from header string
 */
function parseCookies(header) {
  const list = {};
  if (!header) return list;
  header.split(';').forEach((cookie) => {
    const parts = cookie.split('=');
    const name = parts[0]?.trim();
    if (name) {
      list[name] = decodeURIComponent(parts.slice(1).join('=').trim());
    }
  });
  return list;
}

/**
 * Generates HMAC signature for session token
 */
function signSessionToken(payload) {
  const raw = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', SESSION_SECRET).update(raw).digest('base64url');
  return `${raw}.${sig}`;
}

/**
 * Verifies signed session token
 */
function verifySessionToken(token) {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [raw, sig] = parts;
  const expected = crypto.createHmac('sha256', SESSION_SECRET).update(raw).digest('base64url');
  if (crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) {
    try {
      const payload = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'));
      if (payload.exp && Date.now() > payload.exp) {
        return null;
      }
      return payload;
    } catch (_) {
      return null;
    }
  }
  return null;
}

/**
 * Issues a session token (valid for 24 hours)
 */
function issueSession(ip) {
  const payload = {
    sub: 'office_user',
    ip,
    iat: Date.now(),
    exp: Date.now() + 24 * 60 * 60 * 1000,
  };
  const token = signSessionToken(payload);
  validSessions.set(token, payload);
  return token;
}

/**
 * Records a failed PIN attempt with progressive lockout
 */
function recordFailedPinAttempt(ip) {
  const now = Date.now();
  const current = pinLockouts.get(ip) || { failedAttempts: 0, lockedUntil: 0 };
  current.failedAttempts += 1;

  if (current.failedAttempts >= 5) {
    // 5 attempts = 15 min lockout
    current.lockedUntil = now + 15 * 60 * 1000;
  }
  pinLockouts.set(ip, current);
  return current;
}

/**
 * Resets failed attempts upon successful authentication
 */
function resetPinAttempts(ip) {
  pinLockouts.delete(ip);
}

/**
 * Checks if an IP is currently locked out
 */
function getPinLockoutInfo(ip) {
  const record = pinLockouts.get(ip);
  if (!record) return { locked: false, remainingAttempts: 5 };
  const now = Date.now();
  if (record.lockedUntil > now) {
    const waitSeconds = Math.ceil((record.lockedUntil - now) / 1000);
    return { locked: true, waitSeconds, remainingAttempts: 0 };
  }
  // Lockout expired
  if (record.lockedUntil && record.lockedUntil <= now) {
    pinLockouts.delete(ip);
    return { locked: false, remainingAttempts: 5 };
  }
  return { locked: false, remainingAttempts: Math.max(0, 5 - record.failedAttempts) };
}

/**
 * Office security request authorization validator
 */
function isAuthorizedRequest(req, state) {
  if (!state.officeSecurity || !state.officeSecurity.enabled) {
    return true;
  }

  // The local host machine loopback is always authorized
  if (isHostRequest(req)) {
    return true;
  }

  // Check signed session cookie
  const cookies = parseCookies(req.headers.cookie);
  const sessionCookie = cookies['airbridge_session'];
  if (sessionCookie && verifySessionToken(sessionCookie)) {
    return true;
  }

  // Check Bearer authorization header
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const bearer = authHeader.slice(7).trim();
    if (verifySessionToken(bearer)) {
      return true;
    }
  }

  // Remote devices supplying valid PIN in header, query, or body (for legacy compatibility)
  const clientPin = (req.headers['x-airbridge-pin'] || req.query.pin || (req.body && req.body.pin) || '').toString().trim();
  if (state.officeSecurity.pin && clientPin === state.officeSecurity.pin) {
    return true;
  }

  return false;
}

/**
 * Middleware enforcing Office Security
 */
function createRequireOfficeAuth(getState) {
  return function requireOfficeAuth(req, res, next) {
    const state = typeof getState === 'function' ? getState() : getState;
    if (isAuthorizedRequest(req, state)) {
      return next();
    }
    return res.status(401).json({
      error: 'Office Space is protected by Room PIN',
      officeSecurity: true,
      requiresPin: true,
    });
  };
}

module.exports = {
  BOOT_HOST_SECRET,
  SESSION_SECRET,
  getNormalizedRemoteAddress,
  isLoopbackAddress,
  isHostRequest,
  getHostAddresses,
  createCorsOriginValidator,
  parseCookies,
  signSessionToken,
  verifySessionToken,
  issueSession,
  recordFailedPinAttempt,
  resetPinAttempts,
  getPinLockoutInfo,
  isAuthorizedRequest,
  createRequireOfficeAuth,
};
