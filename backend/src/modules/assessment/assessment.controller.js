'use strict';

const service  = require('./assessment.service');
const { success, created, paginated } = require('../../utils/apiResponse');
const catchAsync = require('../../utils/catchAsync');

const getQuestions = catchAsync(async (req, res) => {
  const result = await service.getQuestions(req.query);
  paginated(res, result.data, result);
});

const startAssessment = catchAsync(async (req, res) => {
  const assessment = await service.startAssessment(req.user._id, req.body, req);
  created(res, { assessment }, 'Assessment started');
});

const submitResponse = catchAsync(async (req, res) => {
  const assessment = await service.submitResponse(req.params.id, req.user._id, req.body);
  success(res, { assessment });
});

const submitAssessment = catchAsync(async (req, res) => {
  const assessment = await service.submitAssessment(req.params.id, req.user._id);
  success(res, { assessment }, { message: 'Assessment submitted. Scoring in progress.' });
});

const getAssessment = catchAsync(async (req, res) => {
  const assessment = await service.getAssessment(req.params.id, req.user);
  success(res, { assessment });
});

const getMyAssessments = catchAsync(async (req, res) => {
  const result = await service.getUserAssessments(req.user._id, req.query);
  paginated(res, result.data, result);
});

const reviewAssessment = catchAsync(async (req, res) => {
  const assessment = await service.reviewAssessment(req.params.id, req.user._id, req.body);
  success(res, { assessment });
});

/**
 * POST /assessments/:id/retry-scoring
 *
 * Re-queues AI scoring for an assessment whose previous scoring attempt
 * failed (assessment.status === 'failed'). Returns 202 — scoring runs
 * asynchronously via the score-assessment Bull worker, same as the
 * original submit flow.
 *
 * Common causes of a failed scoring attempt:
 *   - AI service was temporarily unreachable (network blip, deploy in progress)
 *   - AI service returned a 5xx during a transient overload
 *
 * Not retriable:
 *   - assessment.status !== 'failed' -> 400 NOT_FAILED
 *   - assessment has zero responses -> 400 NO_RESPONSES
 */
const retryScoring = catchAsync(async (req, res) => {
  const assessment = await service.retryScoring(req.params.id, req.user._id);
  res.status(202).json({
    success: true,
    data: { assessment },
    message: 'Scoring re-queued',
  });
});

module.exports = {
  getQuestions, startAssessment, submitResponse, submitAssessment,
  getAssessment, getMyAssessments, reviewAssessment, retryScoring,
};
