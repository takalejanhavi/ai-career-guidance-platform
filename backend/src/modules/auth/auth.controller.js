'use strict';

const authService = require('./auth.service');
const { success, created, noContent } = require('../../utils/apiResponse');
const { refreshCookieOptions }        = require('../../utils/tokens');
const catchAsync                      = require('../../utils/catchAsync');

const register = catchAsync(async (req, res) => {
  const { user } = await authService.register(req.body, req.ip);
  created(res, { user }, 'Registration successful. Please verify your email.');
});

const login = catchAsync(async (req, res) => {
  const { user, accessToken, refreshToken } = await authService.login(req.body, req.ip);
  res.cookie('refreshToken', refreshToken, refreshCookieOptions());
  success(res, { user, accessToken });
});

const refresh = catchAsync(async (req, res) => {
  const rawToken = req.cookies?.refreshToken || req.body?.refreshToken;
  if (!rawToken) {
    return res.status(401).json({ status: 'fail', code: 'MISSING_TOKEN', message: 'Refresh token not provided' });
  }
  const { accessToken, refreshToken } = await authService.refresh(rawToken, req.ip);
  res.cookie('refreshToken', refreshToken, refreshCookieOptions());
  success(res, { accessToken });
});

const logout = catchAsync(async (req, res) => {
  await authService.logout(req.user._id, req.ip);
  res.clearCookie('refreshToken', { path: '/api/v1/auth' });
  noContent(res);
});

const forgotPassword = catchAsync(async (req, res) => {
  await authService.forgotPassword(req.body.email, req.ip);
  // Always 200 — don't reveal email existence
  success(res, null, { message: 'If that email is registered, a reset link has been sent.' });
});

const resetPassword = catchAsync(async (req, res) => {
  await authService.resetPassword(req.body, req.ip);
  success(res, null, { message: 'Password reset successful. Please log in.' });
});

const verifyEmail = catchAsync(async (req, res) => {
  const { user } = await authService.verifyEmail(req.body, req.ip);
  success(res, { user }, { message: 'Email verified successfully.' });
});

const changePassword = catchAsync(async (req, res) => {
  await authService.changePassword(req.user._id, req.body, req.ip);
  success(res, null, { message: 'Password changed. You have been logged out of other devices.' });
});

const me = catchAsync(async (req, res) => {
  success(res, { user: req.user });
});

module.exports = { register, login, refresh, logout, forgotPassword, resetPassword, verifyEmail, changePassword, me };
