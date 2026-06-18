'use strict';

const Assessment = require('./assessment.model');
const AppError   = require('../../utils/AppError');
const AuditLog   = require('../audit/auditlog.model');
const { Queues } = require('../../config/redis');
const logger     = require('../../config/logger');
const aiClient   = require('./assessment.aiClient');

// ─── Question bank (in production: loaded from DB or config service) ──────────
const QUESTION_BANK = require('./question_bank.json');

// ─── Service methods ──────────────────────────────────────────────────────────

async function getQuestions({ section, page = 1, limit = 20 }) {
  const start = (page - 1) * limit;
  let questions = QUESTION_BANK;
  if (section) questions = questions.filter(q => q.section === section);
  return {
    data:  questions.slice(start, start + limit),
    total: questions.length,
    page,
    limit,
  };
}

async function startAssessment(userId, body, req) {
  // Check for existing in-progress assessment
  const existing = await Assessment.findOne({ userId, status: { $in: ['draft','in_progress'] }, deletedAt: null });
  if (existing) throw AppError.conflict('You already have an assessment in progress', 'ASSESSMENT_IN_PROGRESS');

  // Determine attempt number
  const completedCount = await Assessment.countDocuments({ userId, status: 'scored' });

  const assessment = await Assessment.create({
    userId,
    templateId      : body.templateId,
    templateVersion : body.templateVersion,
    totalQuestions  : body.totalQuestions,
    attemptNumber   : completedCount + 1,
    sessionMeta: {
      userAgent  : req.headers['user-agent'] || null,
      ipAddress  : req.ip,
      startedAt  : new Date(),
      deviceType : body.deviceType,
    },
  });

  await AuditLog.write({ actorId: userId, actorRole: 'student', action: 'assessment.started', resourceType: 'Assessment', resourceId: assessment._id, outcome: 'success' });

  return assessment;
}

async function submitResponse(assessmentId, userId, responseData) {
  const assessment = await Assessment.findOne({ _id: assessmentId, userId, deletedAt: null });
  if (!assessment) throw AppError.notFound('Assessment');
  if (!['draft','in_progress'].includes(assessment.status)) {
    throw AppError.badRequest('Assessment has already been submitted', 'ALREADY_SUBMITTED');
  }

  assessment.addResponse(responseData);
  await assessment.save();

  return assessment;
}

async function submitAssessment(assessmentId, userId) {
  const assessment = await Assessment.findOne({ _id: assessmentId, userId, deletedAt: null });
  if (!assessment) throw AppError.notFound('Assessment');
  if (!['draft','in_progress'].includes(assessment.status)) {
    throw AppError.badRequest('Assessment cannot be submitted in its current state');
  }
  if (assessment.responses.length === 0) {
    throw AppError.badRequest('Cannot submit an assessment with no responses');
  }

  assessment.markSubmitted();
  await assessment.save();

  // Trigger async AI scoring
  await Queues.PDF.add('score-assessment', { assessmentId: String(assessment._id), userId: String(userId) }, { priority: 1 });

  await AuditLog.write({ actorId: userId, actorRole: 'student', action: 'assessment.submitted', resourceType: 'Assessment', resourceId: assessment._id, outcome: 'success', metadata: { responseCount: assessment.responses.length } });

  return assessment;
}

/**
 * Called by the worker queue — calls the AI service and writes scores back.
 *
 * Pipeline:
 *   1. aiClient.scoreAndRecommend() — single call that:
 *      a. computes the 5 dimension scores directly from responses
 *      b. builds the AI feature vector and calls /predict/explain
 *      c. maps the AI response into report.careerRecommendations[] shape
 *      d. generates a narrative summary
 *   2. Persist scores + aiMetadata, mark assessment 'scored'
 *   3. Queue report generation with the mapped recommendations
 *
 * On AI service failure (AIServiceError): assessment is marked 'failed'
 * with a `failureReason` so the student/admin can retry via
 * POST /assessments/:id/retry-scoring without resubmitting answers.
 *
 * On validation failure (AIResponseValidationError): same as above, but
 * also logged at error level — this indicates an AI service contract
 * change that needs developer attention, not a transient issue.
 */
async function scoreAssessment(assessmentId) {
  const assessment = await Assessment.findById(assessmentId).populate('userId', 'firstName');
  if (!assessment) throw new Error(`Assessment ${assessmentId} not found`);

  const firstName = assessment.userId?.firstName || 'Student';

  try {
    const t0 = Date.now();
    const result = await aiClient.scoreAndRecommend(assessment, firstName);
    const inferenceMs = Date.now() - t0;

    // ── Persist dimension scores (computed independently of the AI call) ───
    assessment.scores = result.scores;
    assessment.aiMetadata = {
      modelVersion    : result.modelVersion,
      inferenceMs,
      confidenceScore : result.confidence,
      processedAt     : new Date(),
    };
    assessment.status = 'scored';
    assessment.failureReason = undefined;
    await assessment.save();

    // ── Trigger report generation with mapped recommendations ──────────────
    await Queues.PDF.add('generate-report', {
      assessmentId   : String(assessment._id),
      userId         : String(assessment.userId._id || assessment.userId),
      recommendations: result.recommendations,
      narrative      : result.narrative,
      aiModelVersion : result.modelVersion,
    });

    await AuditLog.write({
      actorId     : assessment.userId._id || assessment.userId,
      actorRole   : 'student',
      action      : 'assessment.scored',
      resourceType: 'Assessment',
      resourceId  : assessment._id,
      outcome     : 'success',
      metadata    : { inferenceMs, confidence: result.confidence, modelVersion: result.modelVersion },
    });

  } catch (err) {
    const isAIError = err instanceof aiClient.AIServiceError
                    || err instanceof aiClient.AIResponseValidationError;

    logger.error('AI scoring failed for assessment %s: %s', assessmentId, err.message, {
      assessmentId,
      errorType: err.constructor.name,
      isAIError,
    });

    assessment.status        = 'failed';
    assessment.failureReason = isAIError
      ? `AI service error: ${err.message}`
      : `Scoring error: ${err.message}`;
    await assessment.save();

    await AuditLog.write({
      actorId     : assessment.userId._id || assessment.userId,
      actorRole   : 'student',
      action      : 'assessment.scoring_failed',
      resourceType: 'Assessment',
      resourceId  : assessment._id,
      outcome     : 'failure',
      metadata    : { error: err.message, errorType: err.constructor.name },
    });

    throw err; // let Bull apply retry/backoff
  }
}

/**
 * Re-queue scoring for a previously failed assessment.
 * Called via POST /assessments/:id/retry-scoring.
 *
 * Only assessments in 'failed' status (and only those that previously
 * reached 'submitted' — i.e. have responses) can be retried.
 */
async function retryScoring(assessmentId, userId) {
  const assessment = await Assessment.findOne({ _id: assessmentId, userId, deletedAt: null });
  if (!assessment) throw AppError.notFound('Assessment');
  if (assessment.status !== 'failed') {
    throw AppError.badRequest('Only failed assessments can be retried', 'NOT_FAILED');
  }
  if (assessment.responses.length === 0) {
    throw AppError.badRequest('Assessment has no responses to score', 'NO_RESPONSES');
  }

  assessment.status = 'submitted';
  await assessment.save();

  await Queues.PDF.add('score-assessment', { assessmentId: String(assessment._id), userId: String(userId) }, { priority: 1 });

  await AuditLog.write({
    actorId: userId, actorRole: 'student', action: 'assessment.scoring_retried',
    resourceType: 'Assessment', resourceId: assessment._id, outcome: 'success',
  });

  return assessment;
}

async function getAssessment(assessmentId, requestingUser) {
  const query = { _id: assessmentId, deletedAt: null };
  // Students can only see their own; psychologists + admins see any
  if (requestingUser.role === 'student') query.userId = requestingUser._id;

  const assessment = await Assessment.findOne(query).populate('userId', 'firstName lastName email');
  if (!assessment) throw AppError.notFound('Assessment');

  if (requestingUser.role !== 'student') {
    await AuditLog.write({ actor: requestingUser, action: 'report.viewed', resourceType: 'Assessment', resourceId: assessment._id, outcome: 'success' });
  }

  return assessment;
}

async function getUserAssessments(userId, { page, limit, status }) {
  const filter = { userId, deletedAt: null };
  if (status) filter.status = status;

  const [data, total] = await Promise.all([
    Assessment.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit),
    Assessment.countDocuments(filter),
  ]);

  return { data, total, page, limit };
}

async function reviewAssessment(assessmentId, psychologistId, { reviewNote }) {
  const assessment = await Assessment.findOne({ _id: assessmentId, status: 'scored', deletedAt: null });
  if (!assessment) throw AppError.notFound('Scored assessment');

  assessment.reviewedBy = psychologistId;
  assessment.reviewedAt = new Date();
  assessment.reviewNote = reviewNote;
  await assessment.save();

  await AuditLog.write({ actorId: psychologistId, actorRole: 'psychologist', action: 'report.annotation_added', resourceType: 'Assessment', resourceId: assessment._id, outcome: 'success' });

  return assessment;
}

module.exports = {
  getQuestions, startAssessment, submitResponse, submitAssessment,
  scoreAssessment, retryScoring, getAssessment, getUserAssessments, reviewAssessment,
};
