'use strict';

/**
 * workers.js — Bull queue consumers
 *
 * generate-pdf job now uses pdf.service.js → ReportGenerator.
 * The old inline generatePDF() function and uploadToS3() helper
 * have been removed. All PDF generation goes through the production
 * 5-page renderer.
 */

const { Queues }   = require('../config/redis');
const Report       = require('../modules/reports/report.model');
const Psychologist = require('../modules/psychologist/psychologist.model');
const { scoreAssessment } = require('../modules/assessment/assessment.service');
const { createReport }    = require('../modules/reports/report.service');
const pdfService   = require('../services/pdf.service');
const emailService = require('../services/email.service');
const logger       = require('../config/logger');
const AuditLog     = require('../modules/audit/auditlog.model');

// ─── PDF Workers ──────────────────────────────────────────────────────────────

Queues.PDF.process('score-assessment', 2, async (job) => {
  const { assessmentId } = job.data;
  logger.info('[Worker:PDF] Scoring assessment %s', assessmentId);
  await scoreAssessment(assessmentId);
});

Queues.PDF.process('generate-report', 2, async (job) => {
  const { assessmentId, userId, recommendations, narrative, aiModelVersion } = job.data;
  logger.info('[Worker:PDF] Creating report for assessment %s', assessmentId);
  await createReport({ assessmentId, userId, recommendations, narrative, aiModelVersion });
});

/**
 * generate-pdf
 * ============
 * Produces the production 5-page PDF via ReportGenerator and uploads to S3.
 *
 * Job payload: { reportId, userId }
 *
 * Steps:
 *   1. Load Report with all required relations populated
 *   2. Optionally load the assigned psychologist profile
 *   3. Call pdfService.generateAndUpload() — uses ReportGenerator
 *   4. Persist PDF metadata to Report document
 *   5. Notify student
 *
 * On failure: mark report as 'failed', persist error, rethrow so Bull
 * can apply its exponential back-off retry policy (max 3 attempts).
 */
Queues.PDF.process('generate-pdf', 2, async (job) => {
  const { reportId } = job.data;
  logger.info('[Worker:PDF] Generating PDF for report %s', reportId);

  // ── 1. Load report with all required relations ──────────────────────────
  const report = await Report.findById(reportId)
    .populate('userId',       'firstName lastName email phone dateOfBirth institution gradeLevel country')
    .populate('assessmentId', 'scores aiMetadata sessionMeta templateId templateVersion attemptNumber totalQuestions status updatedAt');

  if (!report) throw new Error(`Report ${reportId} not found`);

  try {
    // ── 2. Load assigned psychologist (optional) ──────────────────────────
    // Find the psychologist who has this student assigned, if any.
    // Populate their user doc for name/credentials.
    let psychologist = null;
    try {
      psychologist = await Psychologist.findOne({
        assignedStudentIds: report.userId._id,
        isVerifiedProfessional: true,
      }).populate('userId', 'firstName lastName email');
    } catch {
      // Non-critical — PDF renders without psychologist section
    }

    // ── 3. Generate PDF and upload to S3 ─────────────────────────────────
    const { url, key, hash, pages, sizeBytes } =
      await pdfService.generateAndUpload(report, psychologist);

    // ── 4. Persist PDF metadata ───────────────────────────────────────────
    report.markPdfReady({
      url,
      key,
      sizeBytes,
      pageCount  : pages,
      sha256Hash : hash,
    });
    await report.save();

    // ── 5. Notify student ─────────────────────────────────────────────────
    await Queues.NOTIFICATION.add('report-ready', {
      userId  : String(report.userId._id),
      reportId: String(report._id),
      title   : report.title,
    });

    logger.info(
      '[Worker:PDF] Done — report=%s pages=%d size=%dKB hash=%s',
      reportId, pages, Math.round(sizeBytes / 1024), hash.substring(0, 16)
    );

  } catch (err) {
    report.status          = 'failed';
    report.generationError = err.message;
    await report.save();
    logger.error('[Worker:PDF] Failed for report=%s: %s', reportId, err.message);
    throw err;  // rethrow so Bull applies retry + backoff
  }
});

// ─── Blockchain Worker ────────────────────────────────────────────────────────

Queues.BLOCKCHAIN.process('anchor-report', 1, async (job) => {
  const { reportId, hash, userId } = job.data;
  logger.info('[Worker:Blockchain] Anchoring report %s', reportId);

  const report = await Report.findById(reportId).populate('userId', '_id');
  if (!report) throw new Error(`Report ${reportId} not found`);

  const pdfHash   = hash || report.pdf?.sha256Hash;
  if (!pdfHash) throw new Error(`Report ${reportId} has no pdf.sha256Hash to anchor`);

  const studentId = String(report.userId._id || report.userId);

  try {
    const blockchain = require('../services/blockchain.service');
    const result = await blockchain.anchorReport({
      reportId,
      pdfHash,
      studentId,
      metadataURI: '',
    });

    report.confirmBlockchain({
      txHash          : result.txHash,
      contractAddress : result.contractAddress,
      blockNumber     : result.blockNumber,
      blockTimestamp  : new Date(result.blockTimestamp * 1000),
      gasUsed         : result.gasUsed,
      network         : result.network,
    });
    await report.save();

    await AuditLog.write({
      actorId     : userId,
      actorRole   : 'student',
      action      : 'blockchain.anchor_confirmed',
      resourceType: 'Report',
      resourceId  : report._id,
      outcome     : 'success',
      metadata    : { txHash: result.txHash, network: result.network, blockNumber: result.blockNumber },
    });

    await Queues.NOTIFICATION.add('blockchain-confirmed', { userId, reportId });

  } catch (err) {
    report.blockchain.status        = 'failed';
    report.blockchain.failureReason = err.message;
    report.blockchain.retryCount    = (report.blockchain.retryCount || 0) + 1;
    await report.save();
    await AuditLog.write({
      actorId     : userId,
      actorRole   : 'student',
      action      : 'blockchain.anchor_failed',
      resourceType: 'Report',
      resourceId  : report._id,
      outcome     : 'failure',
      metadata    : { error: err.message },
    });
    throw err;
  }
});

// ─── Email Workers ────────────────────────────────────────────────────────────

Queues.EMAIL.process('verify-email',    5, async (job) => { await emailService.sendVerificationEmail(job.data); });
Queues.EMAIL.process('password-reset',  5, async (job) => { await emailService.sendPasswordResetEmail(job.data); });
Queues.EMAIL.process('password-changed',5, async (job) => { await emailService.sendPasswordChangedEmail(job.data); });
Queues.EMAIL.process('report-shared',   5, async (job) => { await emailService.sendReportSharedEmail(job.data); });

// ─── Notification Workers ─────────────────────────────────────────────────────

Queues.NOTIFICATION.process('report-ready', 5, async (job) => {
  const { userId, reportId, title } = job.data;
  const notifService = require('../modules/notifications/notification.service');
  await notifService.create({
    userId,
    type        : 'report.ready',
    title       : 'Your career report is ready',
    body        : `Your career guidance report "${title}" has been generated and is ready to view.`,
    resourceType: 'Report',
    resourceId  : reportId,
    channels    : ['in_app', 'email'],
  });
});

Queues.NOTIFICATION.process('blockchain-confirmed', 5, async (job) => {
  const notifService = require('../modules/notifications/notification.service');
  await notifService.create({
    userId      : job.data.userId,
    type        : 'report.blockchain_confirmed',
    title       : 'Report verified on blockchain',
    body        : 'Your career report hash has been anchored to the blockchain and is now permanently verifiable.',
    resourceType: 'Report',
    resourceId  : job.data.reportId,
    channels    : ['in_app'],
  });
});

logger.info('[Workers] All queue workers registered');

module.exports = {};
