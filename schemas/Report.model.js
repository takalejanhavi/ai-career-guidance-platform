'use strict';

/**
 * Report Model
 * Generated career guidance report linking an assessment to AI recommendations.
 * Stores PDF metadata, blockchain anchoring state, and sharing visibility.
 *
 * Relationships:
 *   - Report (N) → User (1)       via Report.userId
 *   - Report (1) → Assessment (1) via Report.assessmentId
 *   - Report (1) → Permission (N) via Permission.reportId
 *   - Report (1) → BlockchainRecord (1) [embedded sub-doc]
 */

const mongoose = require('mongoose');
const { Schema, model } = mongoose;

// ─── Sub-schemas ──────────────────────────────────────────────────────────────

/** A single career recommendation from the AI engine */
const CareerRecommendationSchema = new Schema(
  {
    rank        : { type: Number, required: true, min: 1, max: 50 },
    careerSlug  : { type: String, required: true, maxlength: 100 },  // e.g. "software-engineer"
    careerTitle : { type: String, required: true, maxlength: 200 },
    category    : { type: String, required: true, maxlength: 100 },  // e.g. "Technology"
    matchScore  : { type: Number, required: true, min: 0, max: 100 },
    matchLabel  : { type: String, enum: ['poor', 'fair', 'good', 'excellent'], required: true },
    description : { type: String, maxlength: 2000, default: null },
    // Breakdown of which dimensions drove this recommendation
    dimensionWeights: {
      aptitude     : { type: Number, min: 0, max: 1, default: null },
      interest     : { type: Number, min: 0, max: 1, default: null },
      personality  : { type: Number, min: 0, max: 1, default: null },
      values       : { type: Number, min: 0, max: 1, default: null },
      learningStyle: { type: Number, min: 0, max: 1, default: null },
    },
    salaryRange: {
      min     : { type: Number, min: 0, default: null },
      max     : { type: Number, min: 0, default: null },
      currency: { type: String, maxlength: 3, default: 'USD' },
    },
    requiredEducation: { type: String, maxlength: 200, default: null },
    keySkills        : { type: [String], default: [] },
    growthOutlook    : { type: String, enum: ['declining', 'stable', 'growing', 'high_growth', null], default: null },
  },
  { _id: false }
);

/** PDF artifact metadata */
const PdfSchema = new Schema(
  {
    url        : { type: String, maxlength: 1000, default: null },   // S3 / CDN URL
    key        : { type: String, maxlength: 500,  default: null, select: false }, // S3 object key
    sizeBytes  : { type: Number, min: 0, default: null },
    pageCount  : { type: Number, min: 0, default: null },
    sha256Hash : { type: String, maxlength: 64,  default: null },   // for blockchain & integrity
    generatedAt: { type: Date, default: null },
    expiresAt  : { type: Date, default: null },                     // signed URL expiry
    version    : { type: Number, default: 1, min: 1 },             // re-generation counter
  },
  { _id: false }
);

/** On-chain anchoring state */
const BlockchainRecordSchema = new Schema(
  {
    status: {
      type   : String,
      enum   : ['not_anchored', 'pending', 'confirmed', 'failed'],
      default: 'not_anchored',
    },
    txHash          : { type: String, maxlength: 66,  default: null },  // 0x + 64 hex chars
    contractAddress : { type: String, maxlength: 42,  default: null },
    network         : { type: String, maxlength: 50,  default: null },  // e.g. "polygon-mumbai"
    blockNumber     : { type: Number, min: 0, default: null },
    blockTimestamp  : { type: Date,   default: null },
    gasUsed         : { type: Number, min: 0, default: null },
    confirmedAt     : { type: Date,   default: null },
    failureReason   : { type: String, maxlength: 500, default: null },
    retryCount      : { type: Number, default: 0, min: 0, max: 5 },
  },
  { _id: false }
);

/** Psychologist annotation on a shared report */
const AnnotationSchema = new Schema(
  {
    authorId : { type: Schema.Types.ObjectId, ref: 'User', required: true },
    content  : { type: String, required: true, minlength: 1, maxlength: 5000 },
    isPrivate: { type: Boolean, default: true },    // private = only psychologist sees it
    createdAt: { type: Date, default: () => new Date() },
    updatedAt: { type: Date, default: null },
  },
  { _id: true }
);

// ─── Main Schema ──────────────────────────────────────────────────────────────

const ReportSchema = new Schema(
  {
    // ── References ────────────────────────────────────────────────────────────
    userId: {
      type    : Schema.Types.ObjectId,
      ref     : 'User',
      required: [true, 'userId is required'],
      index   : true,
    },

    assessmentId: {
      type    : Schema.Types.ObjectId,
      ref     : 'Assessment',
      required: [true, 'assessmentId is required'],
      index   : true,
    },

    // ── Title & Display ───────────────────────────────────────────────────────
    title: {
      type     : String,
      default  : 'MentorChain Career Report',
      maxlength: 200,
      trim     : true,
    },

    // ── Status ────────────────────────────────────────────────────────────────
    status: {
      type   : String,
      enum   : ['generating', 'ready', 'failed', 'archived'],
      default: 'generating',
      index  : true,
    },

    generationError: { type: String, maxlength: 1000, default: null },

    // ── Visibility & Sharing ──────────────────────────────────────────────────
    visibility: {
      type   : String,
      enum   : ['private', 'shared', 'public'],
      default: 'private',
      index  : true,
    },

    // ── AI Content ────────────────────────────────────────────────────────────
    careerRecommendations: {
      type    : [CareerRecommendationSchema],
      default : [],
      validate: {
        validator(v) { return v.length <= 50; },
        message  : 'Cannot store more than 50 career recommendations',
      },
    },

    // Summary narrative generated by AI
    narrative: {
      type     : String,
      maxlength: 10000,
      default  : null,
    },

    // AI model version that generated this report
    aiModelVersion: {
      type    : String,
      maxlength: 50,
      default : null,
    },

    // ── PDF ───────────────────────────────────────────────────────────────────
    pdf: { type: PdfSchema, default: () => ({}) },

    // ── Blockchain ────────────────────────────────────────────────────────────
    blockchain: { type: BlockchainRecordSchema, default: () => ({}) },

    // ── Psychologist annotations ──────────────────────────────────────────────
    annotations: {
      type    : [AnnotationSchema],
      default : [],
      validate: {
        validator(v) { return v.length <= 100; },
        message  : 'Cannot store more than 100 annotations per report',
      },
    },

    // ── Soft delete ───────────────────────────────────────────────────────────
    deletedAt: { type: Date, default: null },
  },
  {
    timestamps: true,
    versionKey: '__v',
    toJSON    : { virtuals: true },
    toObject  : { virtuals: true },
  }
);

// ─── Virtuals ─────────────────────────────────────────────────────────────────

ReportSchema.virtual('isVerifiedOnChain').get(function () {
  return this.blockchain?.status === 'confirmed';
});

ReportSchema.virtual('topCareer').get(function () {
  const careers = this.careerRecommendations || [];
  return careers.find(c => c.rank === 1) || null;
});

ReportSchema.virtual('permissions', {
  ref         : 'Permission',
  localField  : '_id',
  foreignField: 'reportId',
});

// ─── Indexes ──────────────────────────────────────────────────────────────────

ReportSchema.index({ userId: 1, createdAt: -1 },              { name: 'idx_reports_user_date' });
ReportSchema.index({ assessmentId: 1 },                       { unique: true, sparse: true, name: 'idx_reports_assessment' });
ReportSchema.index({ status: 1, visibility: 1 },              { name: 'idx_reports_status_visibility' });
ReportSchema.index({ 'blockchain.status': 1 },                { name: 'idx_reports_blockchain_status' });
ReportSchema.index({ 'pdf.sha256Hash': 1 },                   { sparse: true, name: 'idx_reports_pdf_hash' });
ReportSchema.index({ visibility: 1, deletedAt: 1 },           { name: 'idx_reports_public' });
ReportSchema.index({ userId: 1, status: 1, deletedAt: 1 },   { name: 'idx_reports_user_status' });
// Compound for psychologist shared-reports query
ReportSchema.index(
  { visibility: 1, 'careerRecommendations.category': 1 },
  { partialFilterExpression: { status: 'ready', deletedAt: null }, name: 'idx_reports_shared_category' }
);

// ─── Pre-save Hooks ───────────────────────────────────────────────────────────

ReportSchema.pre('save', function (next) {
  // Sort recommendations by rank ascending before persisting
  if (this.isModified('careerRecommendations')) {
    this.careerRecommendations.sort((a, b) => a.rank - b.rank);
  }
  next();
});

// ─── Instance Methods ─────────────────────────────────────────────────────────

ReportSchema.methods.addAnnotation = function (authorId, content, isPrivate = true) {
  this.annotations.push({ authorId, content, isPrivate });
};

ReportSchema.methods.markPdfReady = function ({ url, key, sizeBytes, pageCount, sha256Hash }) {
  this.pdf = { url, key, sizeBytes, pageCount, sha256Hash, generatedAt: new Date(), version: (this.pdf?.version || 0) + 1 };
  this.status = 'ready';
};

ReportSchema.methods.markBlockchainPending = function (txHash, network) {
  this.blockchain.status  = 'pending';
  this.blockchain.txHash  = txHash;
  this.blockchain.network = network;
};

ReportSchema.methods.confirmBlockchain = function ({ blockNumber, blockTimestamp, gasUsed, contractAddress }) {
  Object.assign(this.blockchain, {
    status: 'confirmed', blockNumber, blockTimestamp, gasUsed, contractAddress, confirmedAt: new Date(),
  });
};

// ─── Static Methods ───────────────────────────────────────────────────────────

ReportSchema.statics.findPendingBlockchain = function () {
  return this.find({ 'blockchain.status': 'pending', deletedAt: null });
};

ReportSchema.statics.verifyHash = async function (reportId, hash) {
  const report = await this.findOne({ _id: reportId, 'pdf.sha256Hash': hash, deletedAt: null });
  return report !== null;
};

// ─── Export ───────────────────────────────────────────────────────────────────

module.exports = model('Report', ReportSchema);
