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
const env          = require('../config/env');

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

/**
 * anchor-report
 * =============
 * Idempotent: safe to run multiple times for the same report.
 *
 * State machine:
 *   not_anchored / failed  → broadcast new tx → save pending → wait → confirm
 *   pending (has txHash)   → skip broadcast, recover receipt → confirm
 *   confirmed              → return immediately (nothing to do)
 *
 * Why Bull retried before this fix:
 *   The old code called anchorReport() (broadcast + wait in one shot). If the
 *   120-second wait timed out, the catch block set status='failed' — discarding
 *   the txHash. On the next Bull retry (attempts:3 in QUEUE_DEFAULTS), the
 *   worker had no record of the pending tx and broadcast a second transaction.
 *
 * The fix: save txHash as status='pending' BEFORE calling waitForConfirmation().
 * On any retry, the pending path detects the txHash and waits for / recovers
 * the original transaction instead of broadcasting again.
 */
Queues.BLOCKCHAIN.process('anchor-report', 1, async (job) => {
  const { reportId, hash, userId } = job.data;
  logger.info('[Worker:Blockchain] anchor-report start reportId=%s attempt=%s', reportId, job.attemptsMade + 1);

  const report = await Report.findById(reportId).populate('userId', '_id');
  if (!report) throw new Error(`Report ${reportId} not found`);

  // ── Guard: already confirmed — nothing to do ──────────────────────────────
  if (report.blockchain.status === 'confirmed') {
    logger.info(
      '[Worker:Blockchain] Already confirmed txHash=%s blockNumber=%d — skipping',
      report.blockchain.txHash, report.blockchain.blockNumber
    );
    return;
  }

  const pdfHash   = hash || report.pdf?.sha256Hash;
  if (!pdfHash) throw new Error(`Report ${reportId} has no pdf.sha256Hash to anchor`);

  const studentId  = String(report.userId._id || report.userId);
  const blockchain = require('../services/blockchain.service');

  // Track whether we've already saved a pending txHash to Mongo.
  // If true and something later throws, the next retry uses the recovery path
  // (existing txHash) rather than broadcasting a new transaction.
  let pendingSaved = report.blockchain.status === 'pending' && !!report.blockchain.txHash;

  try {
    let receipt;

    if (pendingSaved) {
      // ── Recovery path: pending txHash from a previous attempt ──────────────
      // The first attempt broadcast successfully but timed out waiting for
      // confirmation. Recover the receipt for the existing tx.
      logger.info(
        '[Worker:Blockchain] Recovering pending tx txHash=%s',
        report.blockchain.txHash
      );
      receipt = await blockchain.waitForConfirmation(report.blockchain.txHash, 120_000);
      logger.info('[Worker:Blockchain] Receipt received blockNumber=%d', receipt.blockNumber);

    } else {
      // ── Broadcast path: new transaction ────────────────────────────────────
      const tx = await blockchain.broadcastAnchor({ reportId, pdfHash, studentId });
      logger.info('[Worker:Blockchain] Broadcasted tx txHash=%s', tx.hash);

      // Persist txHash BEFORE waiting for confirmation.
      // If waitForConfirmation() times out or throws, the next Bull retry will
      // enter the recovery path above instead of broadcasting a second tx.
      report.markBlockchainPending(tx.hash, env.BLOCKCHAIN_NETWORK || 'polygon-amoy');
      await report.save();
      pendingSaved = true;
      logger.info('[Worker:Blockchain] Pending state saved txHash=%s', tx.hash);

      logger.info('[Worker:Blockchain] Waiting for confirmation...');
      receipt = await blockchain.waitForConfirmation(tx.hash, 120_000);
      logger.info('[Worker:Blockchain] Receipt received blockNumber=%d', receipt.blockNumber);
    }

    // ── Confirm ────────────────────────────────────────────────────────────
    const blockTimestamp = await blockchain.getBlockTimestamp(receipt.blockNumber);

    report.confirmBlockchain({
      txHash          : receipt.hash,
      contractAddress : env.CONTRACT_ADDRESS,
      blockNumber     : receipt.blockNumber,
      blockTimestamp  : new Date(blockTimestamp * 1000),
      gasUsed         : receipt.gasUsed.toString(),
      network         : env.BLOCKCHAIN_NETWORK || 'polygon-amoy',
    });
    await report.save();
    logger.info('[Worker:Blockchain] Mongo updated status=confirmed txHash=%s', receipt.hash);

    await AuditLog.write({
      actorId     : userId,
      actorRole   : 'student',
      action      : 'blockchain.anchor_confirmed',
      resourceType: 'Report',
      resourceId  : report._id,
      outcome     : 'success',
      metadata    : { txHash: receipt.hash, network: env.BLOCKCHAIN_NETWORK, blockNumber: receipt.blockNumber },
    });

    await Queues.NOTIFICATION.add('blockchain-confirmed', { userId, reportId });

    logger.info('[Worker:Blockchain] Job completed reportId=%s txHash=%s', reportId, receipt.hash);

  } catch (err) {
    logger.error(
      '[Worker:Blockchain] Failed reportId=%s attempt=%d: %s\n%s',
      reportId, job.attemptsMade + 1, err.message, err.stack
    );

    // If we haven't yet saved a pending txHash, the broadcast itself failed —
    // mark 'failed' so the retry starts a fresh broadcast attempt.
    // If we DID save a pending txHash, leave status='pending' so the next
    // retry enters the recovery path and waits for the same tx (not a new one).
    if (!pendingSaved) {
      report.blockchain.status        = 'failed';
      report.blockchain.failureReason = err.message;
      report.blockchain.retryCount    = (report.blockchain.retryCount || 0) + 1;
      await report.save().catch(saveErr =>
        logger.error('[Worker:Blockchain] Failed to persist failure state: %s', saveErr.message)
      );
    } else {
      // Keep status='pending'; just update retryCount + reason for observability.
      report.blockchain.retryCount    = (report.blockchain.retryCount || 0) + 1;
      report.blockchain.failureReason = err.message;
      await report.save().catch(saveErr =>
        logger.error('[Worker:Blockchain] Failed to update retryCount: %s', saveErr.message)
      );
    }

    await AuditLog.write({
      actorId     : userId,
      actorRole   : 'student',
      action      : 'blockchain.anchor_failed',
      resourceType: 'Report',
      resourceId  : report._id,
      outcome     : 'failure',
      metadata    : { error: err.message, stack: err.stack, attempt: job.attemptsMade + 1 },
    }).catch(() => {});

    throw err; // Bull applies exponential backoff (attempts:3 in QUEUE_DEFAULTS)
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
