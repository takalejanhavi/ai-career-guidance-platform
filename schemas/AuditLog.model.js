'use strict';

/**
 * AuditLog Model
 * Immutable event trail for compliance, security, and debugging.
 * Every significant state mutation or access event is logged here.
 *
 * Design principles:
 *   - No updates or deletes are permitted (enforced via pre-hooks + MongoDB RBAC)
 *   - Documents are append-only; use TTL for retention policy
 *   - Sensitive field values are redacted before storage
 *   - Structured for SIEM ingestion (consistent schema, JSON-serialisable)
 *
 * Relationships:
 *   - AuditLog (N) → User (1) via AuditLog.actorId   [who performed the action]
 *   - AuditLog (N) → User (1) via AuditLog.targetId  [who/what was affected, optional]
 *   - Loosely coupled — logs survive even if referenced documents are deleted
 */

const mongoose = require('mongoose');
const { Schema, model } = mongoose;

// ─── Constants ────────────────────────────────────────────────────────────────

/**
 * Full catalogue of auditable actions.
 * Convention: RESOURCE_VERB
 */
const AUDIT_ACTIONS = [
  // Auth
  'auth.register',
  'auth.login',
  'auth.login_failed',
  'auth.logout',
  'auth.token_refresh',
  'auth.password_reset_requested',
  'auth.password_reset_completed',
  'auth.email_verified',
  'auth.account_locked',
  'auth.account_unlocked',
  'auth.2fa_enabled',
  'auth.2fa_disabled',

  // Users
  'user.profile_updated',
  'user.role_changed',
  'user.suspended',
  'user.unsuspended',
  'user.deleted',

  // Assessments
  'assessment.started',
  'assessment.submitted',
  'assessment.scored',
  'assessment.deleted',

  // Reports
  'report.generated',
  'report.viewed',
  'report.pdf_downloaded',
  'report.visibility_changed',
  'report.deleted',
  'report.annotation_added',
  'report.annotation_deleted',

  // Permissions
  'permission.granted',
  'permission.revoked',
  'permission.accessed',
  'permission.expired',

  // Blockchain
  'blockchain.anchor_initiated',
  'blockchain.anchor_confirmed',
  'blockchain.anchor_failed',

  // Psychologist
  'psychologist.student_assigned',
  'psychologist.student_unassigned',
  'psychologist.verified',
  'psychologist.rejected',

  // Admin
  'admin.bulk_export',
  'admin.config_changed',
  'admin.user_impersonated',
];

// ─── Sub-schemas ──────────────────────────────────────────────────────────────

/**
 * HTTP request context — captured at request middleware level.
 */
const RequestContextSchema = new Schema(
  {
    method    : { type: String, maxlength: 10,  default: null },
    path      : { type: String, maxlength: 500, default: null },
    ip        : { type: String, maxlength: 45,  default: null },
    userAgent : { type: String, maxlength: 500, default: null },
    requestId : { type: String, maxlength: 100, default: null },  // X-Request-ID header
    durationMs: { type: Number, min: 0, default: null },
  },
  { _id: false }
);

/**
 * Slim before/after snapshot for mutation events.
 * Values must be pre-sanitized (no passwords, no PII tokens).
 */
const DiffSchema = new Schema(
  {
    field   : { type: String, required: true, maxlength: 200 },
    before  : { type: Schema.Types.Mixed, default: null },
    after   : { type: Schema.Types.Mixed, default: null },
  },
  { _id: false }
);

// ─── Main Schema ──────────────────────────────────────────────────────────────

const AuditLogSchema = new Schema(
  {
    // ── Who ───────────────────────────────────────────────────────────────────
    actorId: {
      type : Schema.Types.ObjectId,
      ref  : 'User',
      index: true,
      default: null,  // null = system-initiated action
    },

    actorRole: {
      type     : String,
      enum     : ['student', 'psychologist', 'admin', 'system'],
      required : [true, 'actorRole is required'],
    },

    actorEmail: {
      type    : String,
      maxlength: 254,
      default : null,
      // Denormalised so logs are self-contained even if User is deleted
    },

    // ── What ──────────────────────────────────────────────────────────────────
    action: {
      type    : String,
      required: [true, 'action is required'],
      enum    : {
        values : AUDIT_ACTIONS,
        message: '{VALUE} is not a recognised audit action',
      },
      index: true,
    },

    // ── Target resource ───────────────────────────────────────────────────────
    resourceType: {
      type     : String,
      enum     : ['User', 'Assessment', 'Report', 'Permission', 'Psychologist', 'System'],
      required : [true, 'resourceType is required'],
    },

    resourceId: {
      type   : Schema.Types.ObjectId,
      default: null,
      index  : true,
    },

    // Secondary target (e.g. for permission.granted: targetId = grantedTo user)
    targetId: {
      type   : Schema.Types.ObjectId,
      ref    : 'User',
      default: null,
    },

    // ── Outcome ───────────────────────────────────────────────────────────────
    outcome: {
      type    : String,
      enum    : ['success', 'failure', 'partial'],
      required: [true, 'outcome is required'],
    },

    // ── Detail ────────────────────────────────────────────────────────────────
    message: {
      type    : String,
      maxlength: 1000,
      default : null,
    },

    /**
     * Structured metadata relevant to this specific action.
     * Examples:
     *   auth.login_failed:  { reason: 'invalid_password', attempts: 3 }
     *   permission.granted: { capabilities: ['view', 'download'], expiresAt: '...' }
     *   blockchain.*:       { txHash: '0x...', network: 'polygon' }
     */
    metadata: {
      type    : Schema.Types.Mixed,
      default : null,
    },

    // Mutation diff (before/after) for update events
    diff: {
      type    : [DiffSchema],
      default : [],
      validate: {
        validator(v) { return v.length <= 50; },
        message  : 'diff array may not exceed 50 field changes',
      },
    },

    // HTTP request context
    requestContext: { type: RequestContextSchema, default: null },

    // ── Timestamp (explicit; createdAt from timestamps also present) ───────────
    occurredAt: {
      type   : Date,
      default: () => new Date(),
      index  : true,
    },

    // ── Severity ──────────────────────────────────────────────────────────────
    severity: {
      type   : String,
      enum   : ['debug', 'info', 'warn', 'critical'],
      default: 'info',
      index  : true,
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: false }, // no updatedAt — immutable
    versionKey: false,  // no __v on immutable docs
    toJSON    : { virtuals: false },
  }
);

// ─── Immutability enforcement ─────────────────────────────────────────────────

AuditLogSchema.pre('save', function (next) {
  if (!this.isNew) {
    return next(new Error('AuditLog documents are immutable and cannot be updated'));
  }
  next();
});

AuditLogSchema.pre(['updateOne', 'updateMany', 'findOneAndUpdate'], function (next) {
  next(new Error('AuditLog documents are immutable — updates are not permitted'));
});

AuditLogSchema.pre(['deleteOne', 'deleteMany', 'findOneAndDelete'], function (next) {
  // Allow only system-level TTL expiry; block application-layer deletes
  if (!this.getOptions()._allowSystemDelete) {
    next(new Error('AuditLog documents cannot be deleted via application code'));
  } else {
    next();
  }
});

// ─── Indexes ──────────────────────────────────────────────────────────────────

AuditLogSchema.index({ actorId: 1, occurredAt: -1 },      { name: 'idx_audit_actor_date' });
AuditLogSchema.index({ action: 1, occurredAt: -1 },       { name: 'idx_audit_action_date' });
AuditLogSchema.index({ resourceType: 1, resourceId: 1, occurredAt: -1 }, { name: 'idx_audit_resource_date' });
AuditLogSchema.index({ outcome: 1, severity: 1 },         { name: 'idx_audit_outcome_severity' });
AuditLogSchema.index({ occurredAt: -1 },                  { name: 'idx_audit_date_desc' });
// TTL: retain logs for 2 years (63072000 seconds)
AuditLogSchema.index(
  { occurredAt: 1 },
  { expireAfterSeconds: 63072000, name: 'idx_audit_ttl_2yr' }
);
// For SIEM / security dashboards: failed auth attempts
AuditLogSchema.index(
  { action: 1, outcome: 1, occurredAt: -1 },
  {
    partialFilterExpression: { action: 'auth.login_failed' },
    name: 'idx_audit_failed_logins',
  }
);

// ─── Static Factory Methods ───────────────────────────────────────────────────

/**
 * Preferred way to write audit events — ensures consistent shape.
 *
 * @example
 * await AuditLog.write({
 *   actor: req.user,
 *   action: 'report.pdf_downloaded',
 *   resourceType: 'Report',
 *   resourceId: report._id,
 *   outcome: 'success',
 *   requestContext: { method: 'GET', path: req.path, ip: req.ip, ... },
 * });
 */
AuditLogSchema.statics.write = function ({
  actor,
  actorRole,
  actorEmail,
  action,
  resourceType,
  resourceId = null,
  targetId   = null,
  outcome    = 'success',
  message    = null,
  metadata   = null,
  diff       = [],
  requestContext = null,
  severity   = 'info',
}) {
  return this.create({
    actorId     : actor?._id    || null,
    actorRole   : actorRole     || actor?.role || 'system',
    actorEmail  : actorEmail    || actor?.email || null,
    action,
    resourceType,
    resourceId,
    targetId,
    outcome,
    message,
    metadata,
    diff,
    requestContext,
    severity,
    occurredAt  : new Date(),
  });
};

AuditLogSchema.statics.findForResource = function (resourceType, resourceId, limit = 50) {
  return this.find({ resourceType, resourceId })
    .sort({ occurredAt: -1 })
    .limit(limit);
};

AuditLogSchema.statics.findForActor = function (actorId, limit = 100) {
  return this.find({ actorId })
    .sort({ occurredAt: -1 })
    .limit(limit);
};

AuditLogSchema.statics.securitySummary = function (since) {
  return this.aggregate([
    { $match: { occurredAt: { $gte: since }, severity: { $in: ['warn', 'critical'] } } },
    { $group: { _id: { action: '$action', outcome: '$outcome' }, count: { $sum: 1 } } },
    { $sort: { count: -1 } },
  ]);
};

// ─── Export ───────────────────────────────────────────────────────────────────

module.exports = model('AuditLog', AuditLogSchema);
module.exports.AUDIT_ACTIONS = AUDIT_ACTIONS;
