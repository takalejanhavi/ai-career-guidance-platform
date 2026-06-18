'use strict';

const Psychologist = require('./psychologist.model');
const User         = require('../users/user.model');
const AppError     = require('../../utils/AppError');
const AuditLog     = require('../audit/auditlog.model');

// ─── Auto-create profile when psychologist registers ─────────────────────────

async function ensureProfile(userId) {
  const exists = await Psychologist.findOne({ userId });
  if (exists) return exists;
  return Psychologist.create({ userId });
}

// ─── Get own profile ──────────────────────────────────────────────────────────

async function getMyProfile(userId) {
  const profile = await Psychologist.findOne({ userId })
    .populate('userId', 'firstName lastName email profile');
  if (!profile) throw AppError.notFound('Psychologist profile');
  return profile;
}

// ─── Update profile ───────────────────────────────────────────────────────────

async function updateProfile(userId, updates) {
  const allowed = [
    'title', 'specializations', 'yearsOfExperience', 'languages',
    'professionalEmail', 'websiteUrl', 'linkedinUrl',
    'isAcceptingStudents', 'maxStudentCapacity', 'availability',
  ];

  const profile = await Psychologist.findOne({ userId });
  if (!profile) throw AppError.notFound('Psychologist profile');

  for (const key of allowed) {
    if (updates[key] !== undefined) profile[key] = updates[key];
  }
  await profile.save();
  return profile;
}

// ─── Submit for verification ──────────────────────────────────────────────────

async function submitForVerification(userId, credentials) {
  const profile = await Psychologist.findOne({ userId });
  if (!profile) throw AppError.notFound('Psychologist profile');
  if (['pending','approved'].includes(profile.verificationStatus)) {
    throw AppError.conflict('Verification already submitted or approved');
  }

  profile.credentials        = credentials;
  profile.verificationStatus = 'pending';
  await profile.save();

  await AuditLog.write({
    actorId      : userId,
    actorRole    : 'psychologist',
    action       : 'psychologist.verified',
    resourceType : 'Psychologist',
    resourceId   : profile._id,
    outcome      : 'success',
    metadata     : { status: 'pending' },
  });

  return profile;
}

// ─── Admin: approve / reject verification ────────────────────────────────────

async function approveVerification(psychologistId, adminId) {
  const profile = await Psychologist.findById(psychologistId);
  if (!profile) throw AppError.notFound('Psychologist');
  if (profile.verificationStatus !== 'pending') {
    throw AppError.conflict('No pending verification to approve');
  }

  profile.isVerifiedProfessional = true;
  profile.verificationStatus     = 'approved';
  profile.verificationNote       = null;
  // Mark credentials as verified
  profile.credentials.forEach(c => {
    c.verified   = true;
    c.verifiedAt = new Date();
    c.verifiedBy = adminId;
  });
  await profile.save();

  await AuditLog.write({
    actorId      : adminId,
    actorRole    : 'admin',
    action       : 'psychologist.verified',
    resourceType : 'Psychologist',
    resourceId   : profile._id,
    outcome      : 'success',
  });

  return profile;
}

async function rejectVerification(psychologistId, adminId, note) {
  const profile = await Psychologist.findById(psychologistId);
  if (!profile) throw AppError.notFound('Psychologist');

  profile.verificationStatus     = 'rejected';
  profile.isVerifiedProfessional = false;
  profile.verificationNote       = note;
  await profile.save();

  await AuditLog.write({
    actorId      : adminId,
    actorRole    : 'admin',
    action       : 'psychologist.rejected',
    resourceType : 'Psychologist',
    resourceId   : profile._id,
    outcome      : 'success',
    metadata     : { note },
    severity     : 'warn',
  });

  return profile;
}

// ─── Student assignment ───────────────────────────────────────────────────────

async function assignStudent(psychologistUserId, studentId) {
  const profile = await Psychologist.findOne({ userId: psychologistUserId });
  if (!profile) throw AppError.notFound('Psychologist profile');
  if (!profile.isVerifiedProfessional) {
    throw AppError.forbidden('Psychologist must be verified before assigning students');
  }

  const student = await User.findOne({ _id: studentId, role: 'student', isActive: true, deletedAt: null });
  if (!student) throw AppError.notFound('Student');

  profile.assignStudent(studentId);
  await profile.save();

  await AuditLog.write({
    actorId      : psychologistUserId,
    actorRole    : 'psychologist',
    action       : 'psychologist.student_assigned',
    resourceType : 'Psychologist',
    resourceId   : profile._id,
    targetId     : studentId,
    outcome      : 'success',
  });

  return profile;
}

async function unassignStudent(psychologistUserId, studentId) {
  const profile = await Psychologist.findOne({ userId: psychologistUserId });
  if (!profile) throw AppError.notFound('Psychologist profile');

  profile.unassignStudent(studentId);
  await profile.save();
  return profile;
}

// ─── Admin: list pending verifications ───────────────────────────────────────

async function listPendingVerifications({ page = 1, limit = 20 }) {
  const filter = { verificationStatus: 'pending' };
  const [data, total] = await Promise.all([
    Psychologist.find(filter)
      .populate('userId', 'firstName lastName email createdAt')
      .sort({ createdAt: 1 })
      .skip((page - 1) * limit)
      .limit(limit),
    Psychologist.countDocuments(filter),
  ]);
  return { data, total, page, limit };
}

// ─── Public: list available psychologists ────────────────────────────────────

async function listAvailable({ page = 1, limit = 20, specialization, language }) {
  const filter = { isVerifiedProfessional: true, isAcceptingStudents: true };
  if (specialization) filter.specializations = specialization;
  if (language)       filter.languages       = language;

  const [data, total] = await Promise.all([
    Psychologist.find(filter)
      .populate('userId', 'firstName lastName profile.avatarUrl profile.country')
      .select('title specializations yearsOfExperience languages statistics.totalReportsReviewed')
      .sort({ 'statistics.totalReportsReviewed': -1 })
      .skip((page - 1) * limit)
      .limit(limit),
    Psychologist.countDocuments(filter),
  ]);
  return { data, total, page, limit };
}

module.exports = {
  ensureProfile, getMyProfile, updateProfile,
  submitForVerification, approveVerification, rejectVerification,
  assignStudent, unassignStudent,
  listPendingVerifications, listAvailable,
};
