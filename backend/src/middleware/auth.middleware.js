'use strict';

const { verifyAccessToken } = require('../utils/tokens');
const AppError              = require('../utils/AppError');
const catchAsync            = require('../utils/catchAsync');
const User                  = require('../modules/users/user.model');

/**
 * Extracts and verifies the Bearer token from Authorization header.
 * Attaches the full user document to req.user.
 * Fails with 401 if token is missing, invalid, or user no longer exists.
 */
const authenticate = catchAsync(async (req, res, next) => {
  // 1. Extract token
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw AppError.unauthorized('No access token provided');
  }

  const token = authHeader.split(' ')[1];

  // 2. Verify signature + expiry
  const decoded = verifyAccessToken(token);

  // 3. Load user (checks isActive, not deleted)
  const user = await User.findOne({
    _id:       decoded.sub,
    isActive:  true,
    deletedAt: null,
  }).select('+security');

  if (!user) {
    throw AppError.unauthorized('User belonging to this token no longer exists');
  }

  if (user.isSuspended) {
    throw AppError.forbidden('Your account has been suspended');
  }

  // 4. Check if password was changed after token was issued
  if (user.security?.passwordChangedAt) {
    const changedAt = Math.floor(user.security.passwordChangedAt.getTime() / 1000);
    if (decoded.iat < changedAt) {
      throw AppError.unauthorized('Password was recently changed. Please log in again.');
    }
  }

  req.user = user;
  next();
});

/**
 * Optional authentication — populates req.user if a valid token is present,
 * but does not fail if missing. Used for public endpoints that have optional
 * authenticated behaviour (e.g. public report view).
 */
const authenticateOptional = catchAsync(async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) return next();

  try {
    const token   = authHeader.split(' ')[1];
    const decoded = verifyAccessToken(token);
    const user    = await User.findOne({ _id: decoded.sub, isActive: true, deletedAt: null });
    if (user) req.user = user;
  } catch (_) {
    // Silent — optional auth failure is not an error
  }

  next();
});

module.exports = { authenticate, authenticateOptional };
