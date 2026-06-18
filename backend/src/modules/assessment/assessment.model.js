'use strict';

const mongoose = require('mongoose');
const { Schema, model } = mongoose;

const ResponseSchema = new Schema({
  questionId   : { type: String, required: true, maxlength: 100 },
  questionText : { type: String, required: true, maxlength: 1000 },
  answer       : { type: Schema.Types.Mixed, required: true },
  answeredAt   : { type: Date, default: () => new Date() },
  timeSpentMs  : { type: Number, min: 0, default: null },
  section      : { type: String, enum: ['aptitude','interest','personality','values','learning_style'], required: true },
  rawScore     : { type: Number, min: 0, max: 10, default: null },
}, { _id: false });

const DimensionScoreSchema = new Schema({
  score      : { type: Number, required: true, min: 0, max: 100 },
  tier       : { type: String, enum: ['low','moderate','high','very_high'], required: true },
  percentile : { type: Number, min: 0, max: 100, default: null },
}, { _id: false });

const ScoresSchema = new Schema({
  aptitude     : { type: DimensionScoreSchema, default: null },
  interest     : { type: DimensionScoreSchema, default: null },
  personality  : { type: DimensionScoreSchema, default: null },
  values       : { type: DimensionScoreSchema, default: null },
  learningStyle: { type: DimensionScoreSchema, default: null },
  overall      : { type: Number, min: 0, max: 100, default: null },
}, { _id: false });

const AssessmentSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  templateId:      { type: String, required: true, maxlength: 100, default: 'standard_v1' },
  templateVersion: { type: String, maxlength: 20, default: '1.0.0' },
  status: {
    type: String, required: true, index: true,
    enum: ['draft','in_progress','submitted','scored','failed','expired'],
    default: 'draft',
  },
  responses:      { type: [ResponseSchema], default: [] },
  totalQuestions: { type: Number, required: true, min: 1, max: 200 },
  scores:         { type: ScoresSchema, default: null },
  failureReason:  { type: String, maxlength: 1000, default: null },
  aiMetadata: {
    modelVersion    : { type: String, default: null },
    inferenceMs     : { type: Number, default: null },
    confidenceScore : { type: Number, min: 0, max: 1, default: null },
    processedAt     : { type: Date, default: null },
  },
  attemptNumber: { type: Number, default: 1, min: 1, max: 10 },
  sessionMeta: {
    userAgent  : { type: String, default: null },
    ipAddress  : { type: String, select: false, default: null },
    startedAt  : { type: Date, default: null },
    submittedAt: { type: Date, default: null },
    totalTimeMs: { type: Number, default: null },
    deviceType : { type: String, enum: ['desktop','tablet','mobile','unknown'], default: 'unknown' },
  },
  expiresAt: { type: Date, default: () => new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) },
  deletedAt:  { type: Date, default: null },
  reviewedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  reviewedAt: { type: Date, default: null },
  reviewNote: { type: String, maxlength: 2000, default: null },
}, {
  timestamps: true,
  toJSON    : { virtuals: true },
  toObject  : { virtuals: true },
});

// Indexes
AssessmentSchema.index({ userId: 1, status: 1 });
AssessmentSchema.index({ userId: 1, createdAt: -1 });
AssessmentSchema.index({ status: 1, createdAt: -1 });
AssessmentSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0, sparse: true });

// Virtuals
AssessmentSchema.virtual('completionRate').get(function () {
  if (!this.totalQuestions) return 0;
  return Math.round((this.responses.length / this.totalQuestions) * 100);
});
AssessmentSchema.virtual('report', { ref: 'Report', localField: '_id', foreignField: 'assessmentId', justOne: true });

// Methods
AssessmentSchema.methods.addResponse = function (data) {
  const idx = this.responses.findIndex(r => r.questionId === data.questionId);
  if (idx > -1) Object.assign(this.responses[idx], data, { answeredAt: new Date() });
  else           this.responses.push(data);
  if (this.status === 'draft') this.status = 'in_progress';
};
AssessmentSchema.methods.markSubmitted = function () {
  this.status = 'submitted';
  this.sessionMeta.submittedAt = new Date();
  this.sessionMeta.totalTimeMs = this.sessionMeta.startedAt
    ? Date.now() - this.sessionMeta.startedAt.getTime() : null;
};

// Statics
AssessmentSchema.statics.findLatestForUser = function (userId) {
  return this.findOne({ userId, deletedAt: null }).sort({ createdAt: -1 });
};

module.exports = model('Assessment', AssessmentSchema);
