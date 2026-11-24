const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  isHostRequest,
  createCorsOriginValidator,
  recordFailedPinAttempt,
  resetPinAttempts,
  getPinLockoutInfo,
  issueSession,
  verifySessionToken,
  BOOT_HOST_SECRET,
} = require('../middleware/auth');

describe('Security & Auth Unit Tests', () => {
  describe('isHostRequest', () => {
    it('accepts genuine loopback IPv4 and IPv6 addresses', () => {
      assert.equal(isHostRequest({ socket: { remoteAddress: '127.0.0.1' }, headers: {} }), true);
      assert.equal(isHostRequest({ socket: { remoteAddress: '::1' }, headers: {} }), true);
      assert.equal(isHostRequest({ socket: { remoteAddress: '::ffff:127.0.0.1' }, headers: {} }), true);
    });

    it('rejects spoofed Host or X-Forwarded-Host from remote LAN/external IPs', () => {
      const spoofedReq = {
        socket: { remoteAddress: '192.168.1.100' },
        hostname: 'localhost',
        headers: {
          host: 'localhost:5050',
          'x-forwarded-host': 'localhost',
          'x-forwarded-for': '127.0.0.1',
        },
      };
      assert.equal(isHostRequest(spoofedReq), false);
    });

    it('validates per-boot host token when token is required', () => {
      const reqWithValidToken = {
        socket: { remoteAddress: '127.0.0.1' },
        headers: { 'x-airbridge-host-token': BOOT_HOST_SECRET },
      };
      assert.equal(isHostRequest(reqWithValidToken, true), true);

      const reqWithInvalidToken = {
        socket: { remoteAddress: '127.0.0.1' },
        headers: { 'x-airbridge-host-token': 'wrong-token' },
      };
      assert.equal(isHostRequest(reqWithInvalidToken, true), false);
    });
  });

  describe('CORS Origin Validator', () => {
    const validator = createCorsOriginValidator(5050);

    it('allows requests with missing origin (same-origin / native apps)', (t, done) => {
      validator(null, (err, allow) => {
        assert.equal(err, null);
        assert.equal(allow, true);
        done();
      });
    });

    it('allows localhost and local IP origins', (t, done) => {
      validator('http://localhost:5050', (err, allow) => {
        assert.equal(err, null);
        assert.equal(allow, true);
        done();
      });
    });

    it('rejects malicious third-party external origins', (t, done) => {
      validator('https://evil.example.com', (err, allow) => {
        assert.ok(err);
        assert.equal(allow, false);
        done();
      });
    });
  });

  describe('PIN Limiter & Lockout', () => {
    it('progressively locks out after 5 failed attempts', () => {
      const testIp = '10.0.0.42';
      resetPinAttempts(testIp);

      for (let i = 1; i <= 4; i++) {
        const info = recordFailedPinAttempt(testIp);
        assert.equal(info.failedAttempts, i);
        assert.equal(getPinLockoutInfo(testIp).locked, false);
      }

      // 5th attempt triggers lockout
      const fifth = recordFailedPinAttempt(testIp);
      assert.equal(fifth.failedAttempts, 5);
      const lockout = getPinLockoutInfo(testIp);
      assert.equal(lockout.locked, true);
      assert.ok(lockout.waitSeconds > 0);

      // Reset works
      resetPinAttempts(testIp);
      assert.equal(getPinLockoutInfo(testIp).locked, false);
    });
  });

  describe('Session Token Issuance & Verification', () => {
    it('issues signed tokens that can be verified and detects tampering', () => {
      const token = issueSession('192.168.1.50');
      assert.ok(token);

      const payload = verifySessionToken(token);
      assert.ok(payload);
      assert.equal(payload.sub, 'office_user');
      assert.equal(payload.ip, '192.168.1.50');

      // Tampered token fails
      const tampered = token.slice(0, -3) + 'abc';
      assert.equal(verifySessionToken(tampered), null);
    });
  });
});
