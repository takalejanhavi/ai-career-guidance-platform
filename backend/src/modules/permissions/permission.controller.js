'use strict';

const service    = require('./permission.service');
const { success, created, noContent } = require('../../utils/apiResponse');
const catchAsync = require('../../utils/catchAsync');

const grantPermission = catchAsync(async (req, res) => {
  const perm = await service.grantPermission(req.params.reportId, req.user._id, req.body);
  created(res, { permission: perm });
});

const revokePermission = catchAsync(async (req, res) => {
  await service.revokePermission(req.params.id, req.user._id, req.body.reason);
  noContent(res);
});

const listPermissions = catchAsync(async (req, res) => {
  const perms = await service.listPermissionsForReport(req.params.reportId, req.user._id, req.user.role);
  success(res, { permissions: perms });
});

const getMySharedReports = catchAsync(async (req, res) => {
  const perms = await service.getMySharedReports(req.user._id);
  success(res, { sharedReports: perms });
});

const updatePermission = catchAsync(async (req, res) => {
  const perm = await service.updatePermission(req.params.id, req.user._id, req.body);
  success(res, { permission: perm });
});

module.exports = { grantPermission, revokePermission, listPermissions, getMySharedReports, updatePermission };
