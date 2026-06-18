'use strict';

/**
 * Assessment Model
 * Represents a single career assessment session taken by a student.
 * Stores question responses, computed dimension scores, and session metadata.
 *
 * Relationships:
 *   - Assessment (N) → User (1)    via Assessment.userId       [student]
 *   - Assessment (1) → Report (1)  via Report.assessmentId
 *
 * Lifecycle:  draft → in_progress → submitted → scored → failed
 */

const mongoose = require('mongoose');
const { Schema, model } = mongoose;

// ─── Sub-schemas ──────────────────────────────────────────────────────────────

/**
 * A single question response.
 * questionId references the question bank (external collection or static config).
 */
const ResponseSchema = new Schema(
  {
    questionId   : { type: String, required: true, maxlength: 100 },
    questionText : { type: String, required: true, maxlength: 1000 },
    // Flexible answer: numeric for Likert, string for MCQ, array for multi-select
    answer       : { type: Schema.Types.Mixed, required: true },
    answeredAt   : { type: Date, default: () => new Date() },
    // Time spent on this question in milliseconds
    timeSpentMs  : { type: Number, min: 0, max: 600000, default: null },
    // Which section this question belongs to
    section      : {
      type : String,
      enum : ['aptitude', 'interest', 'personality', 'values', 'learning_style'],
      required: true,
    },
    // Raw numeric score for scoring engine (null for qualitative answers)
    rawScore: { type: Number, min: 0, max: 10, default: null },
  },
  { _id: false }
);

/**
 * Dimension scores computed by the AI scoring engine.
 * Each dimension holds a normalized 0–100 score and a tier label.
 */
const DimensionScoreSchema = new Schema(
  {
    score      : { type: Number, required: true, min: 0, max: 100 },
    tier       : { type: String, enum: ['low', 'moderate', 'high', 'very_high'], required: true },
    percentile : { type: Number, min: 0, max: 100, default: null },
    notes      : { type: String, maxlength: 500, default: null },
  },
  { _id: false }
);

const ScoresSchema = new Schema(
  {
    aptitude     : { type: DimensionScoreSchema, default: null },
    interest     : { type: DimensionScoreSchema, default: null },
    personality  : { type: DimensionScoreSchema, default: null },
    values       : { type: DimensionScoreSchema, default: null },
    learningStyle: { type: DimensionScoreSchema, default: null },
    overall      : { type: Number, min: 0, max: 100, default: null },
  },
  { _id: false }
);

/** Metadata from the AI recommendation engine call */
const AiMetadataSchema = new Schema(
  {
    modelVersion    : { type: String, maxlength: 50, default: null },
    inferenceMs     : { type: Number, min: 0, default: null },       // latency
    confidenceScore : { type: Number, min: 0, max: 1, default: null },
    featureVector   : { type: [Number], default: null, select: false }, // raw ML input, hidden
    processedAt     : { type: Date, default: null },
  },
  { _id: false }
);

/** Session telemetry for UX and fraud detection */
const SessionMetaSchema = new Schema(
  {
    userAgent     : { type: String, maxlength: 500, default: null },
    ipAddress     : { type: String, maxlength: 45,  default: null, select: false },
    startedAt     : { type: Date, default: null },
    submittedAt   : { type: Date, default: null },
    totalTimeMs   : { type: Number, min: 0, default: null },
    tabSwitches   : { type: Number, min: 0, default: 0 },   // anti-cheat signal
    deviceType    : { type: String, enum: ['desktop', 'tablet', 'mobile', 'unknown'], default: 'unknown' },
  },
  { _id: false }
);

// ─── Main Schema ──────────────────────────────────────────────────────────────

const AssessmentSchema = new Schema(
  {
    // ── References ────────────────────────────────────────────────────────────
    userId: {
      type    : Schema.Types.ObjectId,
      ref     : 'User',
      required: [true, 'userId is required'],
      index   : true,
    },

    // Assessment template/version used (allows multiple test types)
    templateId: {
      type     : String,
      required : [true, 'templateId is required'],
      maxlength: 100,
      default  : 'standard_v1',
    },

    templateVersion: {
      type    : String,
      maxlength: 20,
      default : '1.0.0',
    },

    // ── Lifecycle ─────────────────────────────────────────────────────────────
    status: {
      type    : String,
      required: true,
      enum    : {
        values : ['draft', 'in_progress', 'submitted', 'scored', 'failed', 'expired'],
        message: 'Invalid assessment status',
      },
      default: 'draft',
      index  : true,
    },

    // ── Content ───────────────────────────────────────────────────────────────
    responses: {
      type    : [ResponseSchema],
      default : [],
      validate: {
        validator(v) { return v.length <= 200; },
        message  : 'Assessment cannot exceed 200 responses',
      },
    },

    totalQuestions: {
      type    : Number,
      required: true,
      min     : [1,   'Assessment must have at least 1 question'],
      max     : [200, 'Assessment cannot exceed 200 questions'],
    },

    // ── Scoring ───────────────────────────────────────────────────────────────
    scores    : { type: ScoresSchema,     default: null },
    aiMetadata: { type: AiMetadataSchema, default: null },

    // ── Attempt control ───────────────────────────────────────────────────────
    attemptNumber: {
      type   : Number,
      default: 1,
      min    : 1,
      max    : 10,
    },

    // ── Session ───────────────────────────────────────────────────────────────
    sessionMeta: { type: SessionMetaSchema, default: () => ({}) },

    // ── Expiry ────────────────────────────────────────────────────────────────
    expiresAt: {
      type   : Date,
      default: () => new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
      index  : true,
    },

    // ── Soft delete ───────────────────────────────────────────────────────────
    deletedAt: { type: Date, default: null },

    // ── Psychologist review flag ───────────────────────────────────────────────
    reviewedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    reviewedAt: { type: Date, default: null },
    reviewNote : { type: String, maxlength: 2000, default: null },
  },
  {
    timestamps: true,
    versionKey: '__v',
    toJSON    : { virtuals: true },
    toObject  : { virtuals: true },
  }
);

// ─── Virtuals ─────────────────────────────────────────────────────────────────

AssessmentSchema.virtual('completionRate').get(function () {
  if (!this.totalQuestions || this.totalQuestions === 0) return 0;
  return Math.round((this.responses.length / this.totalQuestions) * 100);
});

AssessmentSchema.virtual('isComplete').get(function () {
  return ['scored', 'submitted'].includes(this.status);
});

AssessmentSchema.virtual('report', {
  ref         : 'Report',
  localField  : '_id',
  foreignField: 'assessmentId',
  justOne     : true,
});

// ─── Indexes ──────────────────────────────────────────────────────────────────

AssessmentSchema.index({ userId: 1, status: 1 },        { name: 'idx_assessments_user_status' });
AssessmentSchema.index({ userId: 1, createdAt: -1 },     { name: 'idx_assessments_user_date' });
AssessmentSchema.index({ status: 1, createdAt: -1 },     { name: 'idx_assessments_status_date' });
AssessmentSchema.index({ expiresAt: 1 },                 { expireAfterSeconds: 0, sparse: true, name: 'idx_assessments_ttl' });
AssessmentSchema.index({ templateId: 1, templateVersion: 1 }, { name: 'idx_assessments_template' });
AssessmentSchema.index(
  { userId: 1, templateId: 1, status: 1 },
  { partialFilterExpression: { deletedAt: null }, name: 'idx_assessments_user_template_status' }
);

// ─── Validation ───────────────────────────────────────────────────────────────

AssessmentSchema.pre('validate', function (next) {
  // Submitted assessment must have at least one response
  if (this.status === 'submitted' && this.responses.length === 0) {
    return next(new Error('Cannot submit an assessment with no responses'));
  }
  // Scored assessment must have scores
  if (this.status === 'scored' && !this.scores) {
    return next(new Error('Scored assessment must include dimension scores'));
  }
  next();
});

// ─── Instance Methods ─────────────────────────────────────────────────────────

AssessmentSchema.methods.addResponse = function (responseData) {
  const exists = this.responses.find(r => r.questionId === responseData.questionId);
  if (exists) {
    // Update in place
    Object.assign(exists, responseData, { answeredAt: new Date() });
  } else {
    this.responses.push(responseData);
  }
  if (this.status === 'draft') this.status = 'in_progress';
};

AssessmentSchema.methods.markSubmitted = function () {
  this.status                  = 'submitted';
  this.sessionMeta.submittedAt = new Date();
  this.sessionMeta.totalTimeMs = this.sessionMeta.startedAt
    ? Date.now() - this.sessionMeta.startedAt.getTime()
    : null;
};

// ─── Static Methods ───────────────────────────────────────────────────────────

AssessmentSchema.statics.findLatestForUser = function (userId) {
  return this.findOne({ userId, deletedAt: null }).sort({ createdAt: -1 });
};

AssessmentSchema.statics.countCompletedForUser = function (userId) {
  return this.countDocuments({ userId, status: 'scored', deletedAt: null });
};

// ─── Export ───────────────────────────────────────────────────────────────────

module.exports = model('Assessment', AssessmentSchema);
