'use strict';

const Permission  = require('./permission.model');
const Report      = require('../reports/report.model');
const User        = require('../users/user.model');
const AppError    = require('../../utils/AppError');
const AuditLog    = require('../audit/auditlog.model');
const { Queues }  = require('../../config/redis');

async function grantPermission(reportId, ownerId, { grantedToEmail, permissions, expiresAt, shareMessage }) {
  // Verify report ownership
  const report = await Report.findOne({ _id: reportId, userId: ownerId, deletedAt: null });
  if (!report) throw AppError.notFound('Report');
  if (report.status !== 'ready') throw AppError.badRequest('Report must be ready before sharing');

  // Look up grantee
  const grantee = await User.findByEmail(grantedToEmail);
  if (!grantee) throw AppError.notFound('User with that email');
  if (String(grantee._id) === String(ownerId)) throw AppError.badRequest('You cannot share a report with yourself');

  // Upsert permission
  const perm = await Permission.findOneAndUpdate(
    { reportId, grantedTo: grantee._id },
    {
      $set: {
        grantedBy: ownerId, permissions, shareMessage: shareMessage || null,
        expiresAt: expiresAt ? new Date(expiresAt) : null,
        isRevoked: false, revokedAt: null, revokedReason: null,
      },
    },
    { upsert: true, new: true, runValidators: true }
  );

  // Update report visibility to 'shared' if currently private
  if (report.visibility === 'private') {
    await Report.findByIdAndUpdate(reportId, { visibility: 'shared' });
  }

  // Queue notification email
  await Queues.EMAIL.add('report-shared', {
    granteeId    : String(grantee._id),
    granteeEmail : grantee.email,
    granteeName  : grantee.firstName,
    ownerName    : `${(await User.findById(ownerId)).firstName}`,
    reportId     : String(reportId),
    permissions,
    shareMessage,
  });

  await AuditLog.write({ actorId: ownerId, actorRole: 'student', action: 'permission.granted', resourceType: 'Permission', resourceId: perm._id, targetId: grantee._id, outcome: 'success', metadata: { capabilities: permissions, expiresAt } });

  return perm.populate('grantedTo', 'firstName lastName email');
}

async function revokePermission(permissionId, ownerId, reason) {
  const perm = await Permission.findOne({ _id: permissionId, grantedBy: ownerId });
  if (!perm) throw AppError.notFound('Permission');
  if (perm.isRevoked) throw AppError.conflict('Permission already revoked');

  perm.revoke(reason);
  await perm.save();

  // If no active permissions remain for this report, set visibility back to private
  const activeCount = await Permission.countDocuments({ reportId: perm.reportId, isRevoked: false });
  if (activeCount === 0) {
    await Report.findByIdAndUpdate(perm.reportId, { visibility: 'private' });
  }

  await AuditLog.write({ actorId: ownerId, actorRole: 'student', action: 'permission.revoked', resourceType: 'Permission', resourceId: perm._id, targetId: perm.grantedTo, outcome: 'success', metadata: { reason } });

  return perm;
}

async function listPermissionsForReport(reportId, ownerId, role) {
  const query = { reportId };
  if (role !== 'admin') {
    const report = await Report.findOne({ _id: reportId, userId: ownerId });
    if (!report) throw AppError.forbidden('You do not own this report');
  }
  return Permission.find(query).populate('grantedTo', 'firstName lastName email profile.avatarUrl');
}

async function getMySharedReports(userId) {
  return Permission.findActiveForGrantee(userId);
}

async function updatePermission(permissionId, ownerId, updates) {
  const perm = await Permission.findOne({ _id: permissionId, grantedBy: ownerId, isRevoked: false });
  if (!perm) throw AppError.notFound('Permission');

  if (updates.permissions) perm.permissions = updates.permissions;
  if (updates.expiresAt !== undefined) perm.expiresAt = updates.expiresAt ? new Date(updates.expiresAt) : null;

  await perm.save();
  return perm;
}

module.exports = { grantPermission, revokePermission, listPermissionsForReport, getMySharedReports, updatePermission };
