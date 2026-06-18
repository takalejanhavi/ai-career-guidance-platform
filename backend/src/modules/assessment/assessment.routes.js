'use strict';

const router     = require('express').Router();
const ctrl       = require('./assessment.controller');
const { authenticate } = require('../../middleware/auth.middleware');
const { authorize, psychologistOrAdmin } = require('../../middleware/rbac.middleware');
const { validate, paginationSchema } = require('../../middleware/validate');
const v = require('./assessment.validation');

router.use(authenticate);

// Students
router.get('/questions',          validate(paginationSchema, 'query'),          ctrl.getQuestions);
router.get('/my',                 validate(paginationSchema, 'query'),          ctrl.getMyAssessments);
router.post('/start',             authorize('student'), validate(v.startAssessmentSchema), ctrl.startAssessment);
router.patch('/:id/answer',       authorize('student'), validate(v.assessmentIdSchema, 'params'), validate(v.submitResponseSchema), ctrl.submitResponse);
router.post('/:id/submit',        authorize('student'), validate(v.assessmentIdSchema, 'params'), ctrl.submitAssessment);

// Re-queue scoring after a failed AI service call (see assessment.aiClient AIServiceError)
router.post('/:id/retry-scoring', authorize('student'), validate(v.assessmentIdSchema, 'params'), validate(v.retryScoringSchema), ctrl.retryScoring);

// All authenticated
router.get('/:id',                validate(v.assessmentIdSchema, 'params'),     ctrl.getAssessment);

// Psychologists + admins
router.patch('/:id/review',       psychologistOrAdmin, validate(v.assessmentIdSchema, 'params'), validate(v.reviewAssessmentSchema), ctrl.reviewAssessment);

module.exports = router;
