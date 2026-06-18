'use strict';

const service    = require('./user.service');
const { success, noContent, paginated } = require('../../utils/apiResponse');
const catchAsync = require('../../utils/catchAsync');

// ─── Profile (self) ───────────────────────────────────────────────────────────

const getMyProfile = catchAsync(async (req, res) => {
  const user = await service.getProfile(req.user._id);
  success(res, { user });
});

const updateMyProfile = catchAsync(async (req, res) => {
  const user = await service.updateProfile(req.user._id, req.body);
  success(res, { user });
});

// ─── Admin: user management ───────────────────────────────────────────────────

const listUsers = catchAsync(async (req, res) => {
  const result = await service.listUsers(req.query);
  paginated(res, result.data, result);
});

const getUserById = catchAsync(async (req, res) => {
  const user = await service.getUserById(req.params.id);
  success(res, { user });
});

const changeRole = catchAsync(async (req, res) => {
  const user = await service.changeRole(req.params.id, req.body.role, req.user._id);
  success(res, { user });
});

const suspendUser = catchAsync(async (req, res) => {
  const user = await service.suspendUser(req.params.id, req.body.reason, req.user._id);
  success(res, { user });
});

const unsuspendUser = catchAsync(async (req, res) => {
  const user = await service.unsuspendUser(req.params.id, req.user._id);
  success(res, { user });
});

const deleteUser = catchAsync(async (req, res) => {
  await service.deleteUser(req.params.id, req.user._id);
  noContent(res);
});

const getUserAuditLog = catchAsync(async (req, res) => {
  const result = await service.getUserAuditLog(req.params.id, req.query);
  paginated(res, result.data, result);
});

module.exports = {
  getMyProfile, updateMyProfile,
  listUsers, getUserById, changeRole,
  suspendUser, unsuspendUser, deleteUser, getUserAuditLog,
};
