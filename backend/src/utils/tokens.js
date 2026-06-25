'use strict';

const jwt    = require('jsonwebtoken');
const crypto = require('crypto');
const env    = require('../config/env');

// Normalise PEM keys — env vars may have literal \n instead of newlines
const PRIVATE_KEY = env.JWT_PRIVATE_KEY.replace(/\\n/g, '\n');
const PUBLIC_KEY  = env.JWT_PUBLIC_KEY.replace(/\\n/g, '\n');

/**
 * Sign an access token (short-lived, RS256).
 * Payload is minimal — only what's needed to authorise a request.
 */
function signAccessToken(payload) {
  return jwt.sign(payload, PRIVATE_KEY, {
    algorithm : 'RS256',
    expiresIn : env.JWT_ACCESS_EXPIRES,
    issuer    : 'career-guidance-api',
    audience  : 'career-guidance-client',
  });
}

/**
 * Sign a refresh token (long-lived, RS256).
 * Contains only userId and a unique jti for revocation.
 */
function signRefreshToken(userId) {
  const jti = crypto.randomUUID();
  const token = jwt.sign({ sub: userId, jti }, PRIVATE_KEY, {
    algorithm : 'RS256',
    expiresIn : env.JWT_REFRESH_EXPIRES,
    issuer    : 'career-guidance-api',
    audience  : 'career-guidance-refresh',
  });
  return { token, jti };
}

/**
 * Verify an access token.
 * @throws {JsonWebTokenError | TokenExpiredError}
 */
function verifyAccessToken(token) {
  return jwt.verify(token, PUBLIC_KEY, {
    algorithms: ['RS256'],
    issuer    : 'career-guidance-api',
    audience  : 'career-guidance-client',
  });
}

/**
 * Verify a refresh token.
 * @throws {JsonWebTokenError | TokenExpiredError}
 */
function verifyRefreshToken(token) {
  return jwt.verify(token, PUBLIC_KEY, {
    algorithms: ['RS256'],
    issuer    : 'career-guidance-api',
    audience  : 'career-guidance-refresh',
  });
}

/**
 * Hash a raw token value for safe DB storage.
 */
function hashToken(raw) {
  return crypto.createHash('sha256').update(raw).digest('hex');
}

/**
 * Build the cookie options for the refresh token HttpOnly cookie.
 */
function refreshCookieOptions() {
  return {
    httpOnly: true,
    secure  : env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge  : 7 * 24 * 60 * 60 * 1000, // 7 days in ms
    path    : '/api/v1/auth',
  };
}

module.exports = {
  signAccessToken,
  signRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
  hashToken,
  refreshCookieOptions,
};
console.log('PRIVATE KEY START:', PRIVATE_KEY.slice(0, 50));
console.log('PUBLIC KEY START:', PUBLIC_KEY.slice(0, 50));