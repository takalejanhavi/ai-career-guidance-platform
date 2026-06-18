'use strict';

/**
 * User Model
 * Core identity document for all platform participants.
 * Roles: student | psychologist | admin
 *
 * Relationships:
 *   - User (1) → Assessment (N)   via Assessment.userId
 *   - User (1) → Report (N)       via Report.userId
 *   - User (1) → Psychologist (1) via Psychologist.userId  [role=psychologist only]
 *   - User (1) → Notification (N) via Notification.userId
 *   - User (1) → AuditLog (N)     via AuditLog.actorId
 */

const mongoose = require('mongoose');
const bcrypt   = require('bcrypt');
const crypto   = require('crypto');

const { Schema, model } = mongoose;

// ─── Sub-schemas ──────────────────────────────────────────────────────────────

const ProfileSchema = new Schema(
  {
    dateOfBirth : { type: Date,   default: null },
    gender      : { type: String, enum: ['male', 'female', 'non-binary', 'prefer_not_to_say', null], default: null },
    country     : { type: String, maxlength: 100, default: null },
    city        : { type: String, maxlength: 100, default: null },
    institution : { type: String, maxlength: 200, default: null },   // school/university
    gradeLevel  : { type: String, maxlength: 50,  default: null },   // e.g. "Grade 11", "Year 2"
    avatarUrl   : { type: String, maxlength: 500, default: null },
    bio         : { type: String, maxlength: 1000, default: null },
  },
  { _id: false }
);

const SecuritySchema = new Schema(
  {
    passwordChangedAt   : { type: Date,    default: null },
    failedLoginAttempts : { type: Number,  default: 0, min: 0, max: 20 },
    lockUntil           : { type: Date,    default: null },
    lastLoginAt         : { type: Date,    default: null },
    lastLoginIp         : { type: String,  maxlength: 45, default: null },  // IPv4 or IPv6
    twoFactorEnabled    : { type: Boolean, default: false },
    twoFactorSecret     : { type: String,  select: false, default: null },  // TOTP, excluded from queries
  },
  { _id: false }
);

const TokensSchema = new Schema(
  {
    // Stored as SHA-256 hash of the raw refresh token
    refreshTokenHash  : { type: String, select: false, default: null },
    refreshTokenExpiry: { type: Date,   select: false, default: null },
    // Email verification
    emailVerifyToken  : { type: String, select: false, default: null },
    emailVerifyExpiry : { type: Date,   select: false, default: null },
    // Password reset
    passwordResetToken : { type: String, select: false, default: null },
    passwordResetExpiry: { type: Date,   select: false, default: null },
  },
  { _id: false }
);

// ─── Main Schema ──────────────────────────────────────────────────────────────

const UserSchema = new Schema(
  {
    // ── Identity ──────────────────────────────────────────────────────────────
    email: {
      type      : String,
      required  : [true, 'Email is required'],
      unique    : true,
      lowercase : true,
      trim      : true,
      maxlength : [254, 'Email must not exceed 254 characters'],
      match     : [/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'Invalid email format'],
    },

    firstName: {
      type     : String,
      required : [true, 'First name is required'],
      trim     : true,
      minlength: [1, 'First name must be at least 1 character'],
      maxlength: [100, 'First name must not exceed 100 characters'],
    },

    lastName: {
      type     : String,
      required : [true, 'Last name is required'],
      trim     : true,
      minlength: [1, 'Last name must be at least 1 character'],
      maxlength: [100, 'Last name must not exceed 100 characters'],
    },

    phone: {
      type     : String,
      trim     : true,
      match    : [/^\+?[1-9]\d{6,14}$/, 'Invalid phone number format'],
      default  : null,
    },

    // ── Auth ──────────────────────────────────────────────────────────────────
    passwordHash: {
      type    : String,
      required: [true, 'Password hash is required'],
      select  : false,                        // never returned in queries by default
    },

    role: {
      type    : String,
      required: [true, 'Role is required'],
      enum    : {
        values : ['student', 'psychologist', 'admin'],
        message: 'Role must be student, psychologist, or admin',
      },
    },

    // ── Status ────────────────────────────────────────────────────────────────
    isActive: {
      type   : Boolean,
      default: true,
      index  : true,
    },

    isEmailVerified: {
      type   : Boolean,
      default: false,
    },

    isSuspended: {
      type   : Boolean,
      default: false,
    },

    suspendedReason: {
      type    : String,
      maxlength: 500,
      default : null,
    },

    // ── Sub-documents ─────────────────────────────────────────────────────────
    profile  : { type: ProfileSchema,  default: () => ({}) },
    security : { type: SecuritySchema, default: () => ({}) },
    tokens   : { type: TokensSchema,   default: () => ({}), select: false },

    // ── Soft delete ───────────────────────────────────────────────────────────
    deletedAt: { type: Date, default: null },
  },
  {
    timestamps    : true,                         // adds createdAt, updatedAt
    versionKey    : '__v',
    toJSON        : { virtuals: true, transform: sanitizeOutput },
    toObject      : { virtuals: true },
    collation     : { locale: 'en', strength: 2 }, // case-insensitive email uniqueness
  }
);

// ─── Virtuals ─────────────────────────────────────────────────────────────────

UserSchema.virtual('fullName').get(function () {
  return `${this.firstName} ${this.lastName}`;
});

UserSchema.virtual('isLocked').get(function () {
  return !!(this.security.lockUntil && this.security.lockUntil > Date.now());
});

// ─── Indexes ──────────────────────────────────────────────────────────────────

UserSchema.index({ email: 1 },                    { unique: true, name: 'idx_users_email' });
UserSchema.index({ role: 1, isActive: 1 },        { name: 'idx_users_role_active' });
UserSchema.index({ createdAt: -1 },               { name: 'idx_users_created_desc' });
UserSchema.index({ isActive: 1, isSuspended: 1 }, { name: 'idx_users_status' });
UserSchema.index({ 'profile.institution': 1 },    { sparse: true, name: 'idx_users_institution' });
UserSchema.index({ deletedAt: 1 },                { sparse: true, name: 'idx_users_deleted' });
// Partial index: only active, non-deleted users (used in most queries)
UserSchema.index(
  { role: 1, createdAt: -1 },
  { partialFilterExpression: { isActive: true, deletedAt: null }, name: 'idx_users_active_role' }
);

// ─── Pre-save Hooks ───────────────────────────────────────────────────────────

UserSchema.pre('save', async function (next) {
  // Only hash password when it has been modified
  if (!this.isModified('passwordHash')) return next();
  try {
    this.passwordHash = await bcrypt.hash(this.passwordHash, 12);
    this.security.passwordChangedAt = new Date();
    next();
  } catch (err) {
    next(err);
  }
});

// ─── Instance Methods ─────────────────────────────────────────────────────────

UserSchema.methods.comparePassword = async function (candidatePassword) {
  return bcrypt.compare(candidatePassword, this.passwordHash);
};

UserSchema.methods.incrementFailedLogin = async function () {
  this.security.failedLoginAttempts += 1;
  if (this.security.failedLoginAttempts >= 5) {
    // Lock for 15 minutes
    this.security.lockUntil = new Date(Date.now() + 15 * 60 * 1000);
  }
  return this.save({ validateBeforeSave: false });
};

UserSchema.methods.resetFailedLogin = async function () {
  this.security.failedLoginAttempts = 0;
  this.security.lockUntil           = null;
  this.security.lastLoginAt         = new Date();
  return this.save({ validateBeforeSave: false });
};

UserSchema.methods.generateEmailVerifyToken = function () {
  const raw = crypto.randomBytes(32).toString('hex');
  this.tokens.emailVerifyToken  = crypto.createHash('sha256').update(raw).digest('hex');
  this.tokens.emailVerifyExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24h
  return raw; // send this via email; store only the hash
};

UserSchema.methods.generatePasswordResetToken = function () {
  const raw = crypto.randomBytes(32).toString('hex');
  this.tokens.passwordResetToken  = crypto.createHash('sha256').update(raw).digest('hex');
  this.tokens.passwordResetExpiry = new Date(Date.now() + 60 * 60 * 1000); // 1h
  return raw;
};

UserSchema.methods.softDelete = async function () {
  this.deletedAt  = new Date();
  this.isActive   = false;
  this.email      = `deleted_${this._id}@deleted.invalid`;
  return this.save({ validateBeforeSave: false });
};

// ─── Static Methods ───────────────────────────────────────────────────────────

UserSchema.statics.findByEmail = function (email) {
  return this.findOne({ email: email.toLowerCase().trim(), deletedAt: null });
};

UserSchema.statics.findActiveById = function (id) {
  return this.findOne({ _id: id, isActive: true, deletedAt: null });
};

// ─── Query Helpers ────────────────────────────────────────────────────────────

UserSchema.query.active = function () {
  return this.where({ isActive: true, deletedAt: null });
};

UserSchema.query.withRole = function (role) {
  return this.where({ role });
};

// ─── Output Sanitizer ─────────────────────────────────────────────────────────

function sanitizeOutput(doc, ret) {
  delete ret.passwordHash;
  delete ret.tokens;
  delete ret.security?.twoFactorSecret;
  delete ret.__v;
  return ret;
}

// ─── Export ───────────────────────────────────────────────────────────────────

module.exports = model('User', UserSchema);
