'use strict';

const User       = require('./user.model');
const AppError   = require('../../utils/AppError');
const AuditLog   = require('../audit/auditlog.model');

// ─── Profile ──────────────────────────────────────────────────────────────────

async function getProfile(userId) {
  const user = await User.findOne({ _id: userId, isActive: true, deletedAt: null });
  if (!user) throw AppError.notFound('User');
  return user;
}

async function updateProfile(userId, updates) {
  const allowed = ['firstName', 'lastName', 'phone'];
  const profileAllowed = ['dateOfBirth', 'gender', 'country', 'city', 'institution', 'gradeLevel', 'bio', 'avatarUrl'];

  const user = await User.findOne({ _id: userId, isActive: true, deletedAt: null });
  if (!user) throw AppError.notFound('User');

  const diff = [];

  // Top-level fields
  for (const key of allowed) {
    if (updates[key] !== undefined && updates[key] !== user[key]) {
      diff.push({ field: key, before: user[key], after: updates[key] });
      user[key] = updates[key];
    }
  }

  // Profile sub-document fields
  for (const key of profileAllowed) {
    if (updates.profile?.[key] !== undefined && updates.profile[key] !== user.profile[key]) {
      diff.push({ field: `profile.${key}`, before: user.profile[key], after: updates.profile[key] });
      user.profile[key] = updates.profile[key];
    }
  }

  await user.save({ validateBeforeSave: true });

  await AuditLog.write({
    actor        : user,
    action       : 'user.profile_updated',
    resourceType : 'User',
    resourceId   : user._id,
    outcome      : 'success',
    diff,
  });

  return user;
}

// ─── Admin: list all users ────────────────────────────────────────────────────

async function listUsers({ page = 1, limit = 20, role, search, isActive }) {
  const filter = { deletedAt: null };
  if (role)              filter.role     = role;
  if (isActive != null)  filter.isActive = isActive;
  if (search) {
    const re = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    filter.$or = [{ firstName: re }, { lastName: re }, { email: re }];
  }

  const [data, total] = await Promise.all([
    User.find(filter)
      .select('firstName lastName email role isActive isEmailVerified isSuspended createdAt')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit),
    User.countDocuments(filter),
  ]);

  return { data, total, page, limit };
}

// ─── Admin: get single user ───────────────────────────────────────────────────

async function getUserById(userId) {
  const user = await User.findOne({ _id: userId, deletedAt: null });
  if (!user) throw AppError.notFound('User');
  return user;
}

// ─── Admin: change role ───────────────────────────────────────────────────────

async function changeRole(targetUserId, newRole, adminId) {
  const user = await User.findOne({ _id: targetUserId, deletedAt: null });
  if (!user) throw AppError.notFound('User');
  if (user.role === newRole) throw AppError.conflict(`User already has role '${newRole}'`);

  const oldRole = user.role;
  user.role = newRole;
  await user.save({ validateBeforeSave: false });

  await AuditLog.write({
    actorId      : adminId,
    actorRole    : 'admin',
    action       : 'user.role_changed',
    resourceType : 'User',
    resourceId   : user._id,
    outcome      : 'success',
    diff         : [{ field: 'role', before: oldRole, after: newRole }],
  });

  return user;
}

// ─── Admin: suspend / unsuspend ───────────────────────────────────────────────

async function suspendUser(targetUserId, reason, adminId) {
  const user = await User.findOne({ _id: targetUserId, deletedAt: null });
  if (!user) throw AppError.notFound('User');
  if (user.isSuspended) throw AppError.conflict('User is already suspended');

  user.isSuspended     = true;
  user.suspendedReason = reason || 'Suspended by administrator';
  await user.save({ validateBeforeSave: false });

  await AuditLog.write({
    actorId      : adminId,
    actorRole    : 'admin',
    action       : 'user.suspended',
    resourceType : 'User',
    resourceId   : user._id,
    outcome      : 'success',
    metadata     : { reason },
    severity     : 'warn',
  });

  return user;
}

async function unsuspendUser(targetUserId, adminId) {
  const user = await User.findOne({ _id: targetUserId, deletedAt: null });
  if (!user) throw AppError.notFound('User');
  if (!user.isSuspended) throw AppError.conflict('User is not suspended');

  user.isSuspended     = false;
  user.suspendedReason = null;
  await user.save({ validateBeforeSave: false });

  await AuditLog.write({
    actorId      : adminId,
    actorRole    : 'admin',
    action       : 'user.suspended',   // reuse — differentiate via diff
    resourceType : 'User',
    resourceId   : user._id,
    outcome      : 'success',
    diff         : [{ field: 'isSuspended', before: true, after: false }],
  });

  return user;
}

// ─── Admin: soft-delete ───────────────────────────────────────────────────────

async function deleteUser(targetUserId, adminId) {
  const user = await User.findOne({ _id: targetUserId, deletedAt: null });
  if (!user) throw AppError.notFound('User');

  await user.softDelete();

  await AuditLog.write({
    actorId      : adminId,
    actorRole    : 'admin',
    action       : 'user.deleted',
    resourceType : 'User',
    resourceId   : user._id,
    outcome      : 'success',
    severity     : 'warn',
  });
}

// ─── Admin: get audit trail for a user ───────────────────────────────────────

async function getUserAuditLog(userId, { page = 1, limit = 50 }) {
  const [data, total] = await Promise.all([
    AuditLog.find({ $or: [{ actorId: userId }, { resourceId: userId }] })
      .sort({ occurredAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit),
    AuditLog.countDocuments({ $or: [{ actorId: userId }, { resourceId: userId }] }),
  ]);
  return { data, total, page, limit };
}

module.exports = {
  getProfile,
  updateProfile,
  listUsers,
  getUserById,
  changeRole,
  suspendUser,
  unsuspendUser,
  deleteUser,
  getUserAuditLog,
};
