'use strict';

const crypto   = require('crypto');
const User     = require('../users/user.model');
const AppError = require('../../utils/AppError');
const tokens   = require('../../utils/tokens');
const { Queues } = require('../../config/redis');
const AuditLog = require('../audit/auditlog.model');

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function issueTokenPair(user) {
  const payload = { sub: String(user._id), role: user.role, email: user.email };
  const accessToken  = tokens.signAccessToken(payload);
  const { token: refreshToken, jti } = tokens.signRefreshToken(String(user._id));

  // Store hashed refresh token
  const userDoc = await User.findById(user._id).select('+tokens');
  userDoc.tokens.refreshTokenHash  = tokens.hashToken(refreshToken);
  userDoc.tokens.refreshTokenExpiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  await userDoc.save({ validateBeforeSave: false });

  return { accessToken, refreshToken };
}

// ─── Service methods ──────────────────────────────────────────────────────────

async function register({ firstName, lastName, email, password, role, phone }, ip) {
  const existing = await User.findByEmail(email);
  if (existing) throw AppError.conflict('An account with this email already exists', 'EMAIL_IN_USE');

  const user = await User.create({
    firstName, lastName, email, passwordHash: password, role, phone: phone || null,
  });

  // Generate email verification token
  const userWithTokens = await User.findById(user._id).select('+tokens');
  const verifyToken    = userWithTokens.generateEmailVerifyToken();
  await userWithTokens.save({ validateBeforeSave: false });

  // Queue verification email
  await Queues.EMAIL.add('verify-email', { userId: user._id, email: user.email, token: verifyToken, firstName });

  await AuditLog.write({ actor: user, action: 'auth.register', resourceType: 'User', resourceId: user._id, outcome: 'success', requestContext: { ip } });

  return { user };
}

async function login({ email, password }, ip) {
  // Load user with sensitive fields
  const user = await User.findOne({ email, deletedAt: null })
    .select('+passwordHash +security +tokens');

  if (!user) throw AppError.unauthorized('Incorrect email or password');

  if (user.isLocked) {
    throw AppError.unauthorized('Account temporarily locked due to multiple failed attempts. Try again in 15 minutes.');
  }

  const isMatch = await user.comparePassword(password);
  if (!isMatch) {
    await user.incrementFailedLogin();
    await AuditLog.write({ actor: user, action: 'auth.login_failed', resourceType: 'User', resourceId: user._id, outcome: 'failure', metadata: { reason: 'wrong_password', attempts: user.security.failedLoginAttempts }, requestContext: { ip } });
    throw AppError.unauthorized('Incorrect email or password');
  }

  if (!user.isActive || user.isSuspended) {
    throw AppError.forbidden('This account is not active. Please contact support.');
  }

  await user.resetFailedLogin(ip);
  const { accessToken, refreshToken } = await issueTokenPair(user);

  await AuditLog.write({ actor: user, action: 'auth.login', resourceType: 'User', resourceId: user._id, outcome: 'success', requestContext: { ip } });

  return { user, accessToken, refreshToken };
}

async function refresh(rawRefreshToken, ip) {
  let decoded;
  try {
    decoded = tokens.verifyRefreshToken(rawRefreshToken);
  } catch {
    throw AppError.unauthorized('Invalid or expired refresh token');
  }

  const user = await User.findOne({ _id: decoded.sub, isActive: true, deletedAt: null })
    .select('+tokens');

  if (!user) throw AppError.unauthorized('User not found');

  const storedHash = user.tokens?.refreshTokenHash;
  const incomingHash = tokens.hashToken(rawRefreshToken);

  if (!storedHash || storedHash !== incomingHash) {
    // Possible token reuse — invalidate all sessions
    user.tokens.refreshTokenHash = null;
    await user.save({ validateBeforeSave: false });
    await AuditLog.write({ actor: user, action: 'auth.token_refresh', resourceType: 'User', resourceId: user._id, outcome: 'failure', metadata: { reason: 'token_reuse_detected' }, requestContext: { ip } });
    throw AppError.unauthorized('Refresh token reuse detected. Please log in again.');
  }

  if (user.tokens.refreshTokenExpiry < new Date()) {
    throw AppError.unauthorized('Refresh token has expired. Please log in again.');
  }

  const { accessToken, refreshToken: newRefreshToken } = await issueTokenPair(user);
  await AuditLog.write({ actor: user, action: 'auth.token_refresh', resourceType: 'User', resourceId: user._id, outcome: 'success', requestContext: { ip } });

  return { accessToken, refreshToken: newRefreshToken };
}

async function logout(userId, ip) {
  const user = await User.findById(userId).select('+tokens');
  if (user) {
    user.tokens.refreshTokenHash  = null;
    user.tokens.refreshTokenExpiry = null;
    await user.save({ validateBeforeSave: false });
  }
  await AuditLog.write({ actorId: userId, actorRole: 'student', action: 'auth.logout', resourceType: 'User', resourceId: userId, outcome: 'success', requestContext: { ip } });
}

async function forgotPassword(email, ip) {
  const user = await User.findOne({ email, deletedAt: null }).select('+tokens');
  // Always respond successfully — don't reveal if email exists
  if (!user) return;

  const resetToken = user.generatePasswordResetToken();
  await user.save({ validateBeforeSave: false });

  await Queues.EMAIL.add('password-reset', { userId: user._id, email: user.email, token: resetToken, firstName: user.firstName });
  await AuditLog.write({ actor: user, action: 'auth.password_reset_requested', resourceType: 'User', resourceId: user._id, outcome: 'success', requestContext: { ip } });
}

async function resetPassword({ token, password }, ip) {
  const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

  const user = await User.findOne({
    'tokens.passwordResetToken'  : hashedToken,
    'tokens.passwordResetExpiry' : { $gt: new Date() },
    deletedAt: null,
  }).select('+tokens');

  if (!user) throw AppError.badRequest('Password reset token is invalid or has expired', 'INVALID_TOKEN');

  user.passwordHash                = password;
  user.tokens.passwordResetToken   = null;
  user.tokens.passwordResetExpiry  = null;
  user.tokens.refreshTokenHash     = null;   // invalidate all sessions
  await user.save();

  await Queues.EMAIL.add('password-changed', { userId: user._id, email: user.email, firstName: user.firstName });
  await AuditLog.write({ actor: user, action: 'auth.password_reset_completed', resourceType: 'User', resourceId: user._id, outcome: 'success', requestContext: { ip } });
}

async function verifyEmail({ token }, ip) {
  const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

  const user = await User.findOne({
    'tokens.emailVerifyToken'  : hashedToken,
    'tokens.emailVerifyExpiry' : { $gt: new Date() },
    deletedAt: null,
  }).select('+tokens');

  if (!user) throw AppError.badRequest('Verification token is invalid or has expired', 'INVALID_TOKEN');

  user.isEmailVerified            = true;
  user.tokens.emailVerifyToken    = null;
  user.tokens.emailVerifyExpiry   = null;
  await user.save({ validateBeforeSave: false });

  await AuditLog.write({ actor: user, action: 'auth.email_verified', resourceType: 'User', resourceId: user._id, outcome: 'success', requestContext: { ip } });
  return { user };
}

async function changePassword(userId, { currentPassword, newPassword }, ip) {
  const user = await User.findById(userId).select('+passwordHash +tokens +security');
  if (!user) throw AppError.notFound('User');

  const isMatch = await user.comparePassword(currentPassword);
  if (!isMatch) throw AppError.badRequest('Current password is incorrect', 'WRONG_PASSWORD');

  user.passwordHash             = newPassword;
  user.tokens.refreshTokenHash  = null;  // force re-login on other devices
  await user.save();

  await Queues.EMAIL.add('password-changed', { userId: user._id, email: user.email, firstName: user.firstName });
  await AuditLog.write({ actor: user, action: 'auth.password_reset_completed', resourceType: 'User', resourceId: user._id, outcome: 'success', metadata: { via: 'change_password' }, requestContext: { ip } });
}

module.exports = { register, login, refresh, logout, forgotPassword, resetPassword, verifyEmail, changePassword };
