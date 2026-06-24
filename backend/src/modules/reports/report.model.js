'use strict';

const mongoose = require('mongoose');
const { Schema, model } = mongoose;

const TopDriverSchema = new Schema({
  feature:   { type: String, maxlength: 100 },
  impact:    { type: Number },
  direction: { type: String, enum: ['positive', 'negative'], default: 'positive' },
}, { _id: false });

const CareerRecSchema = new Schema({
  rank         : { type: Number, required: true, min: 1, max: 50 },
  careerSlug   : { type: String, required: true, maxlength: 100 },
  careerTitle  : { type: String, required: true, maxlength: 200 },
  category     : { type: String, required: true, maxlength: 100 },
  matchScore   : { type: Number, required: true, min: 0, max: 100 },
  matchLabel   : { type: String, enum: ['poor','fair','good','excellent'], required: true },
  // v1.1.0 additions
  confidenceTier:   { type: String, enum: ['HIGH','MEDIUM','EMERGING','LOW','Very High','High','Moderate','Low'], default: null },
  modelAgreement:   { type: Number, min: 0, max: 1, default: null },
  rfScore:          { type: Number, min: 0, max: 100, default: null },
  xgbScore:         { type: Number, min: 0, max: 100, default: null },
  recommendedRoles: { type: [String], default: [] },
  topDrivers:       { type: [TopDriverSchema], default: [] },
  description  : { type: String, maxlength: 2000, default: null },
  dimensionWeights: {
    aptitude: Number, interest: Number, personality: Number, values: Number, learningStyle: Number,
  },
  salaryRange: { min: Number, max: Number, currency: { type: String, default: 'USD' } },
  requiredEducation : { type: String, maxlength: 200, default: null },
  keySkills         : { type: [String], default: [] },
  growthOutlook     : { type: String, enum: ['declining','stable','growing','high_growth', null], default: null },
}, { _id: false });

const AnnotationSchema = new Schema({
  authorId : { type: Schema.Types.ObjectId, ref: 'User', required: true },
  content  : { type: String, required: true, maxlength: 5000 },
  isPrivate: { type: Boolean, default: true },
  updatedAt: { type: Date, default: null },
}, { timestamps: { createdAt: true, updatedAt: false } });

const ReportSchema = new Schema({
  userId       : { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  assessmentId : { type: Schema.Types.ObjectId, ref: 'Assessment', required: true },
  title        : { type: String, default: 'Career Guidance Report', maxlength: 200 },
  status       : { type: String, enum: ['generating','ready','failed','archived'], default: 'generating', index: true },
  generationError: { type: String, maxlength: 1000, default: null },
  visibility   : { type: String, enum: ['private','shared','public'], default: 'private', index: true },
  careerRecommendations: { type: [CareerRecSchema], default: [] },
  narrative    : { type: String, maxlength: 10000, default: null },
  aiModelVersion: { type: String, maxlength: 50, default: null },
  pdf: {
    url       : { type: String, maxlength: 1000, default: null },
    key       : { type: String, maxlength: 500, select: false, default: null },
    sizeBytes : { type: Number, default: null },
    pageCount : { type: Number, default: null },
    sha256Hash: { type: String, maxlength: 64, default: null },
    generatedAt: { type: Date, default: null },
    version   : { type: Number, default: 1 },
  },
  blockchain: {
    status         : { type: String, enum: ['not_anchored','pending','confirmed','failed'], default: 'not_anchored' },
    txHash         : { type: String, maxlength: 66, default: null },
    contractAddress: { type: String, maxlength: 42, default: null },
    network        : { type: String, maxlength: 50, default: null },
    blockNumber    : { type: Number, default: null },
    blockTimestamp : { type: Date,   default: null },
    confirmedAt    : { type: Date,   default: null },
    failureReason  : { type: String, maxlength: 500, default: null },
    retryCount     : { type: Number, default: 0 },
  },
  annotations: { type: [AnnotationSchema], default: [] },
  deletedAt  : { type: Date, default: null },
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true },
});

// Indexes
ReportSchema.index({ userId: 1, createdAt: -1 });
ReportSchema.index({ assessmentId: 1 }, { unique: true, sparse: true });
ReportSchema.index({ status: 1, visibility: 1 });
ReportSchema.index({ 'blockchain.status': 1 });
ReportSchema.index({ 'pdf.sha256Hash': 1 }, { sparse: true });

// Virtuals
ReportSchema.virtual('isVerifiedOnChain').get(function () {
  return this.blockchain?.status === 'confirmed';
});
ReportSchema.virtual('topCareer').get(function () {
  const careers = this.careerRecommendations || [];
  return careers.find(c => c.rank === 1) || null;
});
ReportSchema.virtual('permissions', { ref: 'Permission', localField: '_id', foreignField: 'reportId' });

// Methods
ReportSchema.methods.markPdfReady = function (pdf) {
  this.pdf    = { ...pdf, generatedAt: new Date(), version: (this.pdf?.version || 0) + 1 };
  this.status = 'ready';
};
ReportSchema.methods.markBlockchainPending = function (txHash, network) {
  this.blockchain.status  = 'pending';
  this.blockchain.txHash  = txHash;
  this.blockchain.network = network;
};
ReportSchema.methods.confirmBlockchain = function (data) {
  Object.assign(this.blockchain, { status: 'confirmed', confirmedAt: new Date(), ...data });
};

module.exports = model('Report', ReportSchema);
