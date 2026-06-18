'use strict';

/**
 * Permission Model
 * Granular, time-limited access grants for report sharing.
 * A student (grantedBy) grants a psychologist (grantedTo) specific
 * capabilities on a specific report.
 *
 * Relationships:
 *   - Permission (N) → Report (1) via Permission.reportId
 *   - Permission (N) → User (1)   via Permission.grantedBy  [student/owner]
 *   - Permission (N) → User (1)   via Permission.grantedTo  [psychologist]
 *
 * Design notes:
 *   - One permission document per (reportId + grantedTo) pair.
 *   - Use $addToSet / $pull to manage the permissions array.
 *   - Revocation is soft: isRevoked=true. Hard delete only on GDPR request.
 *   - Access log embedded for audit trail without a separate collection query.
 */

const mongoose = require('mongoose');
const { Schema, model } = mongoose;

// ─── Sub-schemas ──────────────────────────────────────────────────────────────

/** Lightweight access event embedded for quick audit queries */
const AccessEventSchema = new Schema(
  {
    action  : { type: String, enum: ['view', 'download', 'print'], required: true },
    ip      : { type: String, maxlength: 45, default: null },
    ua      : { type: String, maxlength: 300, default: null },  // user-agent
    at      : { type: Date, default: () => new Date() },
  },
  { _id: false }
);

// ─── Main Schema ──────────────────────────────────────────────────────────────

const PermissionSchema = new Schema(
  {
    // ── References ────────────────────────────────────────────────────────────
    reportId: {
      type    : Schema.Types.ObjectId,
      ref     : 'Report',
      required: [true, 'reportId is required'],
      index   : true,
    },

    grantedBy: {
      type    : Schema.Types.ObjectId,
      ref     : 'User',
      required: [true, 'grantedBy (owner) is required'],
    },

    grantedTo: {
      type    : Schema.Types.ObjectId,
      ref     : 'User',
      required: [true, 'grantedTo (recipient) is required'],
      index   : true,
    },

    // ── Capabilities ──────────────────────────────────────────────────────────
    /**
     * Ordered set of capability strings:
     *   view     – can see the report metadata and AI recommendations
     *   download – can download the PDF
     *   annotate – can add annotations to the report
     *   print    – can trigger a print-optimised view
     */
    permissions: {
      type    : [String],
      enum    : {
        values : ['view', 'download', 'annotate', 'print'],
        message: '{VALUE} is not a valid permission',
      },
      required: [true, 'At least one permission is required'],
      validate: [
        {
          validator(v) { return v.length >= 1; },
          message: 'permissions array must contain at least one capability',
        },
        {
          validator(v) { return v.length === new Set(v).size; },
          message: 'permissions array must not contain duplicates',
        },
      ],
    },

    // ── Lifecycle ─────────────────────────────────────────────────────────────
    isRevoked: {
      type   : Boolean,
      default: false,
      index  : true,
    },

    revokedAt    : { type: Date, default: null },
    revokedReason: { type: String, maxlength: 500, default: null },

    expiresAt: {
      type    : Date,
      default : null,  // null = no expiry
      index   : true,
      validate: {
        validator(v) { return v === null || v > new Date(); },
        message: 'expiresAt must be a future date',
      },
    },

    // ── Invite / Notification ─────────────────────────────────────────────────
    /**
     * Optional message from student to psychologist when sharing.
     */
    shareMessage: {
      type    : String,
      maxlength: 1000,
      default : null,
    },

    notifiedAt: { type: Date, default: null },  // when the share notification email was sent

    // ── Access Log ────────────────────────────────────────────────────────────
    /**
     * Rolling window of the last 50 access events.
     * Older events are pruned to keep document size bounded.
     */
    accessLog: {
      type    : [AccessEventSchema],
      default : [],
      validate: {
        validator(v) { return v.length <= 50; },
        message  : 'accessLog may not exceed 50 entries (older entries are pruned)',
      },
    },

    // ── Metrics (denormalised for fast dashboards) ────────────────────────────
    viewCount    : { type: Number, default: 0, min: 0 },
    downloadCount: { type: Number, default: 0, min: 0 },
    lastAccessAt : { type: Date, default: null },
  },
  {
    timestamps: true,
    versionKey: '__v',
    toJSON    : { virtuals: true },
    toObject  : { virtuals: true },
  }
);

// ─── Virtuals ─────────────────────────────────────────────────────────────────

PermissionSchema.virtual('isActive').get(function () {
  if (this.isRevoked) return false;
  if (this.expiresAt && this.expiresAt < new Date()) return false;
  return true;
});

PermissionSchema.virtual('isExpired').get(function () {
  return this.expiresAt !== null && this.expiresAt < new Date();
});

// ─── Indexes ──────────────────────────────────────────────────────────────────

// Enforce one permission document per (reportId, grantedTo) pair
PermissionSchema.index(
  { reportId: 1, grantedTo: 1 },
  { unique: true, name: 'idx_permissions_report_grantee' }
);

PermissionSchema.index({ grantedTo: 1, isRevoked: 1, expiresAt: 1 }, { name: 'idx_permissions_grantee_active' });
PermissionSchema.index({ grantedBy: 1, createdAt: -1 },              { name: 'idx_permissions_grantor_date' });
PermissionSchema.index({ reportId: 1, isRevoked: 1 },                { name: 'idx_permissions_report_active' });
// TTL index to auto-expire (MongoDB removes expired docs via this index)
PermissionSchema.index(
  { expiresAt: 1 },
  { expireAfterSeconds: 0, sparse: true, name: 'idx_permissions_ttl' }
);

// ─── Pre-save Hooks ───────────────────────────────────────────────────────────

PermissionSchema.pre('save', function (next) {
  // Deduplicate permissions array
  this.permissions = [...new Set(this.permissions)];
  // Ensure 'view' is always present when any other permission is granted
  if (this.permissions.length > 0 && !this.permissions.includes('view')) {
    this.permissions.unshift('view');
  }
  next();
});

// ─── Instance Methods ─────────────────────────────────────────────────────────

PermissionSchema.methods.hasCapability = function (capability) {
  if (!this.isActive) return false;
  return this.permissions.includes(capability);
};

PermissionSchema.methods.revoke = function (reason = null) {
  this.isRevoked      = true;
  this.revokedAt      = new Date();
  this.revokedReason  = reason;
};

PermissionSchema.methods.recordAccess = function (action, ip, ua) {
  this.accessLog.push({ action, ip, ua });
  // Keep only last 50 events
  if (this.accessLog.length > 50) {
    this.accessLog.splice(0, this.accessLog.length - 50);
  }
  this.lastAccessAt = new Date();
  if (action === 'view')     this.viewCount     += 1;
  if (action === 'download') this.downloadCount += 1;
};

// ─── Static Methods ───────────────────────────────────────────────────────────

PermissionSchema.statics.findActiveForGrantee = function (grantedTo) {
  return this.find({
    grantedTo,
    isRevoked: false,
    $or: [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }],
  }).populate('reportId');
};

PermissionSchema.statics.canAccess = async function (reportId, userId, capability = 'view') {
  const perm = await this.findOne({
    reportId,
    grantedTo: userId,
    isRevoked : false,
    $or       : [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }],
  });
  return perm ? perm.permissions.includes(capability) : false;
};

// ─── Export ───────────────────────────────────────────────────────────────────

module.exports = model('Permission', PermissionSchema);
