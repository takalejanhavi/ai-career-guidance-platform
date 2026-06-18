'use strict';

/**
 * Token utility tests.
 * Uses RSA key pair generated inline so no env vars needed.
 */

const crypto = require('crypto');

// Generate a test RSA key pair and inject into process.env
// before the tokens module is loaded
const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding:  { type: 'spki',  format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});

process.env.JWT_PRIVATE_KEY      = privateKey;
process.env.JWT_PUBLIC_KEY       = publicKey;
process.env.JWT_ACCESS_EXPIRES   = '15m';
process.env.JWT_REFRESH_EXPIRES  = '7d';
process.env.NODE_ENV             = 'test';
// Minimal env to pass Zod validation
process.env.FRONTEND_URL  = 'http://localhost:5173';
process.env.MONGODB_URI   = 'mongodb://localhost/test';
process.env.AI_SERVICE_URL    = 'http://localhost:5050';
process.env.AI_SERVICE_SECRET = 'test_secret_12345';
process.env.SMTP_HOST = 'localhost';
process.env.SMTP_USER = 'test';
process.env.SMTP_PASS = 'test';
process.env.EMAIL_FROM = 'test@test.com';
process.env.S3_BUCKET     = 'test-bucket';
process.env.S3_ACCESS_KEY = 'test-key';
process.env.S3_SECRET_KEY = 'test-secret';

const tokens = require('../../src/utils/tokens');

describe('tokens', () => {
  const payload = { sub: '507f1f77bcf86cd799439011', role: 'student', email: 'test@test.com' };

  // ── Access token ────────────────────────────────────────────────────────────

  test('signAccessToken returns a string', () => {
    const token = tokens.signAccessToken(payload);
    expect(typeof token).toBe('string');
    expect(token.split('.')).toHaveLength(3);
  });

  test('verifyAccessToken decodes correct sub', () => {
    const token   = tokens.signAccessToken(payload);
    const decoded = tokens.verifyAccessToken(token);
    expect(decoded.sub).toBe(payload.sub);
    expect(decoded.role).toBe('student');
  });

  test('verifyAccessToken throws on tampered token', () => {
    const token   = tokens.signAccessToken(payload);
    const tampered = token.slice(0, -5) + 'XXXXX';
    expect(() => tokens.verifyAccessToken(tampered)).toThrow();
  });

  // ── Refresh token ───────────────────────────────────────────────────────────

  test('signRefreshToken returns token and jti', () => {
    const { token, jti } = tokens.signRefreshToken('507f1f77bcf86cd799439011');
    expect(typeof token).toBe('string');
    expect(typeof jti).toBe('string');
    expect(jti.length).toBeGreaterThan(0);
  });

  test('verifyRefreshToken decodes sub', () => {
    const userId = '507f1f77bcf86cd799439011';
    const { token } = tokens.signRefreshToken(userId);
    const decoded = tokens.verifyRefreshToken(token);
    expect(decoded.sub).toBe(userId);
    expect(decoded.jti).toBeDefined();
  });

  test('access token rejected by refresh verifier', () => {
    const token = tokens.signAccessToken(payload);
    expect(() => tokens.verifyRefreshToken(token)).toThrow();
  });

  // ── hashToken ───────────────────────────────────────────────────────────────

  test('hashToken is deterministic', () => {
    const raw  = 'random-raw-token-value';
    const h1   = tokens.hashToken(raw);
    const h2   = tokens.hashToken(raw);
    expect(h1).toBe(h2);
    expect(h1).toHaveLength(64);
  });

  test('different inputs produce different hashes', () => {
    expect(tokens.hashToken('abc')).not.toBe(tokens.hashToken('xyz'));
  });

  // ── Cookie options ──────────────────────────────────────────────────────────

  test('refreshCookieOptions returns correct shape', () => {
    const opts = tokens.refreshCookieOptions();
    expect(opts.httpOnly).toBe(true);
    expect(opts.sameSite).toBe('strict');
    expect(typeof opts.maxAge).toBe('number');
  });
});
