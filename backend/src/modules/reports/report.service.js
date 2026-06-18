'use strict';

const crypto     = require('crypto');
const Report     = require('./report.model');
const Permission = require('../permissions/permission.model');
const AppError   = require('../../utils/AppError');
const AuditLog   = require('../audit/auditlog.model');
const { Queues } = require('../../config/redis');
const logger     = require('../../config/logger');

async function createReport({ assessmentId, userId, recommendations, narrative, aiModelVersion }) {
  // Prevent duplicate reports for the same assessment
  const existing = await Report.findOne({ assessmentId, deletedAt: null });
  if (existing) return existing;

  const report = await Report.create({
    userId, assessmentId,
    careerRecommendations: (recommendations || []).map((r, i) => ({ ...r, rank: i + 1 })),
    narrative,
    aiModelVersion,
    status: 'generating',
  });

  // Queue PDF generation
  await Queues.PDF.add('generate-pdf', { reportId: String(report._id), userId: String(userId) });

  await AuditLog.write({ actorId: userId, actorRole: 'student', action: 'report.generated', resourceType: 'Report', resourceId: report._id, outcome: 'success' });

  return report;
}

async function getReport(reportId, requestingUser) {
  const report = await Report.findOne({ _id: reportId, deletedAt: null })
    .populate('userId', 'firstName lastName email')
    .populate('assessmentId', 'scores status completedAt');

  if (!report) throw AppError.notFound('Report');

  // Access control
  const isOwner = String(report.userId._id || report.userId) === String(requestingUser._id);
  const isAdmin = requestingUser.role === 'admin';

  if (!isOwner && !isAdmin) {
    // Check permission grant
    const hasPerm = await Permission.canAccess(reportId, requestingUser._id, 'view');
    if (!hasPerm) throw AppError.forbidden('You do not have access to this report');

    // Record access in permission log
    await Permission.findOneAndUpdate(
      { reportId, grantedTo: requestingUser._id, isRevoked: false },
      { $inc: { viewCount: 1 }, $set: { lastAccessAt: new Date() } }
    );
  }

  await AuditLog.write({ actor: requestingUser, action: 'report.viewed', resourceType: 'Report', resourceId: report._id, outcome: 'success' });

  return report;
}

async function getMyReports(userId, { page, limit, status }) {
  const filter = { userId, deletedAt: null };
  if (status) filter.status = status;

  const [data, total] = await Promise.all([
    Report.find(filter)
      .select('-narrative -careerRecommendations.description')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit),
    Report.countDocuments(filter),
  ]);

  return { data, total, page, limit };
}

async function updateVisibility(reportId, userId, visibility) {
  const report = await Report.findOne({ _id: reportId, userId, deletedAt: null });
  if (!report) throw AppError.notFound('Report');
  if (report.status !== 'ready') throw AppError.badRequest('Report is not ready yet');

  const old = report.visibility;
  report.visibility = visibility;
  await report.save();

  await AuditLog.write({ actorId: userId, actorRole: 'student', action: 'report.visibility_changed', resourceType: 'Report', resourceId: report._id, outcome: 'success', diff: [{ field: 'visibility', before: old, after: visibility }] });

  return report;
}

async function getPdfUrl(reportId, requestingUser) {
  const report = await Report.findOne({ _id: reportId, deletedAt: null }).select('+pdf.key');
  if (!report) throw AppError.notFound('Report');
  if (report.status !== 'ready' || !report.pdf?.url) throw AppError.badRequest('PDF is not ready');

  const isOwner = String(report.userId) === String(requestingUser._id);
  const isAdmin = requestingUser.role === 'admin';

  if (!isOwner && !isAdmin) {
    const hasPerm = await Permission.canAccess(reportId, requestingUser._id, 'download');
    if (!hasPerm) throw AppError.forbidden('You do not have download permission for this report');
  }

  await AuditLog.write({ actor: requestingUser, action: 'report.pdf_downloaded', resourceType: 'Report', resourceId: report._id, outcome: 'success' });

  return report.pdf.url;
}

async function addAnnotation(reportId, authorId, { content, isPrivate }) {
  const report = await Report.findOne({ _id: reportId, deletedAt: null });
  if (!report) throw AppError.notFound('Report');

  // Check permission
  const hasPerm = await Permission.canAccess(reportId, authorId, 'annotate');
  const isOwner = String(report.userId) === String(authorId);
  if (!hasPerm && !isOwner) throw AppError.forbidden('You do not have annotate permission');

  report.annotations.push({ authorId, content, isPrivate: isPrivate ?? true });
  await report.save();

  await AuditLog.write({ actorId: authorId, actorRole: 'psychologist', action: 'report.annotation_added', resourceType: 'Report', resourceId: report._id, outcome: 'success' });

  return report.annotations[report.annotations.length - 1];
}

async function initiateBlockchainAnchor(reportId, userId) {
  const report = await Report.findOne({ _id: reportId, userId, deletedAt: null });
  if (!report) throw AppError.notFound('Report');
  if (report.status !== 'ready')  throw AppError.badRequest('Report must be ready to anchor');
  if (!report.pdf?.sha256Hash)    throw AppError.badRequest('Report PDF hash not available — PDF must be generated first');
  if (report.blockchain?.status === 'confirmed') throw AppError.conflict('Report is already anchored on blockchain');
  if (report.blockchain?.status === 'pending')   throw AppError.conflict('Blockchain anchoring already in progress');

  await Queues.BLOCKCHAIN.add('anchor-report', {
    reportId : String(report._id),
    hash     : report.pdf.sha256Hash,  // 64-char SHA-256 hex
    userId   : String(userId),         // needed by worker to fetch studentId
  });

  report.blockchain.status = 'pending';
  await report.save();

  await AuditLog.write({
    actorId     : userId,
    actorRole   : 'student',
    action      : 'blockchain.anchor_initiated',
    resourceType: 'Report',
    resourceId  : report._id,
    outcome     : 'success',
  });

  return report;
}

async function verifyBlockchain(reportId, hash) {
  const report = await Report.findOne({ _id: reportId, deletedAt: null });
  if (!report) throw AppError.notFound('Report');

  // Always verify against the live chain — never rely on MongoDB status alone.
  // A tampered PDF whose DB record was also altered would otherwise pass verification.
  let onChainValid    = false;
  let onChainRecord   = null;
  let blockchainError = null;

  try {
    const blockchain = require('../../services/blockchain.service');
    const result = await blockchain.verifyIntegrity(reportId, hash);
    onChainValid  = result.valid;
    onChainRecord = result.onChainRecord;
  } catch (err) {
    // Blockchain node unreachable or contract not deployed yet
    // Fall back to DB status so the API stays usable during node downtime
    blockchainError = err.message;
    logger.warn('[Report] On-chain verification failed, falling back to DB status: %s', err.message);
    onChainValid = report.blockchain?.status === 'confirmed' && report.pdf?.sha256Hash === hash;
  }

  const hashMatch = report.pdf?.sha256Hash === hash;

  return {
    reportId,
    verified        : onChainValid,
    onChain         : onChainValid,
    hashMatch,
    txHash          : report.blockchain?.txHash    || null,
    blockNumber     : report.blockchain?.blockNumber || null,
    confirmedAt     : report.blockchain?.confirmedAt || null,
    network         : report.blockchain?.network    || null,
    onChainRecord,
    blockchainError : blockchainError || undefined,
  };
}

async function deleteReport(reportId, userId, role) {
  const query = { _id: reportId, deletedAt: null };
  if (role !== 'admin') query.userId = userId;

  const report = await Report.findOne(query);
  if (!report) throw AppError.notFound('Report');

  report.deletedAt   = new Date();
  report.visibility  = 'private';
  await report.save();

  // Revoke all permissions
  await Permission.updateMany({ reportId }, { $set: { isRevoked: true, revokedAt: new Date(), revokedReason: 'report_deleted' } });

  await AuditLog.write({ actorId: userId, actorRole: role, action: 'report.deleted', resourceType: 'Report', resourceId: report._id, outcome: 'success' });
}

async function getOnChainRecord(reportId) {
  const report = await Report.findOne({ _id: reportId, deletedAt: null });
  if (!report) throw AppError.notFound('Report');

  try {
    const blockchain = require('../../services/blockchain.service');
    const record = await blockchain.getOnChainRecord(reportId);
    return record; // null if never anchored
  } catch (err) {
    logger.warn('[Report] getOnChainRecord failed for %s: %s', reportId, err.message);
    return null;
  }
}

async function revokeOnChain(reportId, adminId) {
  const report = await Report.findOne({ _id: reportId, deletedAt: null });
  if (!report) throw AppError.notFound('Report');
  if (report.blockchain?.status !== 'confirmed') {
    throw AppError.badRequest('Report is not anchored on-chain — nothing to revoke');
  }

  const blockchain = require('../../services/blockchain.service');
  const result = await blockchain.revokeOnChain(reportId);

  // Reflect the revocation in MongoDB so the UI updates immediately
  report.blockchain.status        = 'failed';
  report.blockchain.failureReason = `Revoked on-chain by admin ${adminId} at ${new Date().toISOString()}`;
  await report.save();

  await AuditLog.write({
    actorId     : adminId,
    actorRole   : 'admin',
    action      : 'blockchain.anchor_failed',
    resourceType: 'Report',
    resourceId  : report._id,
    outcome     : 'success',
    metadata    : { reason: 'admin_revoke', txHash: result.txHash },
  });

  return { ...result, reportId };
}

/**
 * Re-queue PDF generation for an existing report.
 * Used when:
 *   - A psychologist adds an annotation after the PDF was already generated
 *   - PDF generation previously failed and needs retry
 *   - Report data was updated and the PDF needs to reflect new info
 *
 * Sets status back to 'generating' so getPdfUrl() correctly reports
 * "not ready" until the new PDF completes.
 */
async function regeneratePdf(reportId, userId) {
  const report = await Report.findOne({ _id: reportId, deletedAt: null });
  if (!report) throw AppError.notFound('Report');

  const isOwner = String(report.userId) === String(userId);
  if (!isOwner) throw AppError.forbidden('Only the report owner can regenerate the PDF');

  report.status = 'generating';
  await report.save();

  await Queues.PDF.add('generate-pdf', { reportId: String(report._id), userId: String(userId) });

  await AuditLog.write({
    actorId     : userId,
    actorRole   : 'student',
    action      : 'report.pdf_regeneration_requested',
    resourceType: 'Report',
    resourceId  : report._id,
    outcome     : 'success',
  });

  return report;
}

module.exports = { createReport, getReport, getMyReports, updateVisibility, getPdfUrl, addAnnotation, regeneratePdf, initiateBlockchainAnchor, verifyBlockchain, getOnChainRecord, revokeOnChain, deleteReport };
