'use strict';

const { z } = require('zod');
const { objectIdSchema } = require('../../middleware/validate');
const QUESTION_BANK = require('./question_bank.json');
const { AI_RAW_FEATURES } = require('./assessment.dto');

// Valid question IDs — used to ensure submitted responses correspond to
// real questions, so assessment.aiClient's QUESTION_FEATURE_MAP lookups
// (keyed by questionId) always have a defined mapping or a sane section
// fallback.
const VALID_QUESTION_IDS = QUESTION_BANK.map(q => q.id);

exports.startAssessmentSchema = z.object({
  templateId      : z.string().max(100).default('standard_v1'),
  templateVersion : z.string().max(20).default('1.0.0'),
  totalQuestions  : z.number().int().min(1).max(200),
  deviceType      : z.enum(['desktop','tablet','mobile','unknown']).default('unknown'),
});

exports.submitResponseSchema = z.object({
  questionId  : z.string().min(1).max(100).refine(
    id => VALID_QUESTION_IDS.includes(id),
    id => ({ message: `Unknown questionId '${id}' — must be one of the question bank IDs` })
  ),
  questionText: z.string().min(1).max(1000),
  answer      : z.union([z.string(), z.number(), z.array(z.string()), z.boolean()]),
  section     : z.enum(['aptitude','interest','personality','values','learning_style']),
  rawScore    : z.number().min(0).max(10).optional(),
  timeSpentMs : z.number().min(0).optional(),
});

exports.submitAssessmentSchema = z.object({
  finalResponse: exports.submitResponseSchema.optional(),
});

exports.reviewAssessmentSchema = z.object({
  reviewNote: z.string().min(1).max(2000),
});

exports.assessmentIdSchema = z.object({
  id: objectIdSchema,
});

// ── AI integration schemas (used by assessment.aiClient and its tests) ──────

/**
 * The 10-feature dict sent to AI service /predict/explain.
 * Every value must be 0-100 (the AI service's RAW_FEATURES scale).
 */
exports.aiFeatureVectorSchema = z.object(
  Object.fromEntries(AI_RAW_FEATURES.map(f => [f, z.number().min(0).max(100)]))
);

/**
 * POST /assessments/:id/retry-scoring has no body — just the id param.
 * Reuses assessmentIdSchema for the :id param validation.
 */
exports.retryScoringSchema = z.object({});
