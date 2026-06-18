'use strict';

const mongoose = require('mongoose');
const bcrypt   = require('bcrypt');
const crypto   = require('crypto');
const { Schema, model } = mongoose;

const ProfileSchema = new Schema({
  dateOfBirth : { type: Date,   default: null },
  gender      : { type: String, enum: ['male','female','non-binary','prefer_not_to_say', null], default: null },
  country     : { type: String, maxlength: 100, default: null },
  city        : { type: String, maxlength: 100, default: null },
  institution : { type: String, maxlength: 200, default: null },
  gradeLevel  : { type: String, maxlength: 50,  default: null },
  avatarUrl   : { type: String, maxlength: 500, default: null },
  bio         : { type: String, maxlength: 1000, default: null },
}, { _id: false });

const SecuritySchema = new Schema({
  passwordChangedAt   : { type: Date,    default: null },
  failedLoginAttempts : { type: Number,  default: 0 },
  lockUntil           : { type: Date,    default: null },
  lastLoginAt         : { type: Date,    default: null },
  lastLoginIp         : { type: String,  maxlength: 45, default: null },
}, { _id: false });

const TokensSchema = new Schema({
  refreshTokenHash    : { type: String, select: false, default: null },
  refreshTokenExpiry  : { type: Date,   select: false, default: null },
  emailVerifyToken    : { type: String, select: false, default: null },
  emailVerifyExpiry   : { type: Date,   select: false, default: null },
  passwordResetToken  : { type: String, select: false, default: null },
  passwordResetExpiry : { type: Date,   select: false, default: null },
}, { _id: false });

const UserSchema = new Schema({
  email: {
    type: String, required: [true, 'Email required'],
    lowercase: true, trim: true, maxlength: 254,
    match: [/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'Invalid email'],
  },
  firstName:    { type: String, required: true, trim: true, maxlength: 100 },
  lastName:     { type: String, required: true, trim: true, maxlength: 100 },
  phone:        { type: String, trim: true, default: null },
  passwordHash: { type: String, required: true, select: false },
  role: {
    type: String, required: true,
    enum: { values: ['student','psychologist','admin'], message: 'Invalid role' },
  },
  isActive:         { type: Boolean, default: true },
  isEmailVerified:  { type: Boolean, default: false },
  isSuspended:      { type: Boolean, default: false },
  suspendedReason:  { type: String,  maxlength: 500, default: null },
  profile:   { type: ProfileSchema,  default: () => ({}) },
  security:  { type: SecuritySchema, default: () => ({}), select: false },
  tokens:    { type: TokensSchema,   default: () => ({}), select: false },
  deletedAt: { type: Date, default: null },
}, {
  timestamps: true,
  toJSON:   { virtuals: true, transform: (_, ret) => { delete ret.passwordHash; delete ret.tokens; delete ret.__v; return ret; } },
  toObject: { virtuals: true },
});

// Indexes
UserSchema.index({ email: 1 },                  { unique: true });
UserSchema.index({ role: 1, isActive: 1 });
UserSchema.index({ createdAt: -1 });
UserSchema.index({ deletedAt: 1 },              { sparse: true });
UserSchema.index({ role: 1, createdAt: -1 },    { partialFilterExpression: { isActive: true, deletedAt: null } });

// Virtual
UserSchema.virtual('fullName').get(function () {
  return `${this.firstName} ${this.lastName}`;
});
UserSchema.virtual('isLocked').get(function () {
  return !!(this.security?.lockUntil && this.security.lockUntil > Date.now());
});

// Hooks
UserSchema.pre('save', async function (next) {
  if (!this.isModified('passwordHash')) return next();
  this.passwordHash = await bcrypt.hash(this.passwordHash, 12);
  if (this.security) this.security.passwordChangedAt = new Date();
  next();
});

// Methods
UserSchema.methods.comparePassword = function (candidate) {
  return bcrypt.compare(candidate, this.passwordHash);
};
UserSchema.methods.incrementFailedLogin = async function () {
  this.security.failedLoginAttempts += 1;
  if (this.security.failedLoginAttempts >= 5) {
    this.security.lockUntil = new Date(Date.now() + 15 * 60 * 1000);
  }
  return this.save({ validateBeforeSave: false });
};
UserSchema.methods.resetFailedLogin = async function (ip) {
  this.security.failedLoginAttempts = 0;
  this.security.lockUntil           = null;
  this.security.lastLoginAt         = new Date();
  this.security.lastLoginIp         = ip || null;
  return this.save({ validateBeforeSave: false });
};
UserSchema.methods.generateEmailVerifyToken = function () {
  const raw = crypto.randomBytes(32).toString('hex');
  this.tokens.emailVerifyToken  = crypto.createHash('sha256').update(raw).digest('hex');
  this.tokens.emailVerifyExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000);
  return raw;
};
UserSchema.methods.generatePasswordResetToken = function () {
  const raw = crypto.randomBytes(32).toString('hex');
  this.tokens.passwordResetToken  = crypto.createHash('sha256').update(raw).digest('hex');
  this.tokens.passwordResetExpiry = new Date(Date.now() + 60 * 60 * 1000);
  return raw;
};
UserSchema.methods.softDelete = async function () {
  this.deletedAt = new Date();
  this.isActive  = false;
  this.email     = `deleted_${this._id}@deleted.invalid`;
  return this.save({ validateBeforeSave: false });
};

// Statics
UserSchema.statics.findByEmail = function (email) {
  return this.findOne({ email: email.toLowerCase().trim(), deletedAt: null });
};

module.exports = model('User', UserSchema);
