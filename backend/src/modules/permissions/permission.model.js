'use strict';

const mongoose = require('mongoose');
const { Schema, model } = mongoose;

const AccessEventSchema = new Schema({
  action : { type: String, enum: ['view','download','print'], required: true },
  ip     : { type: String, maxlength: 45, default: null },
  ua     : { type: String, maxlength: 300, default: null },
  at     : { type: Date, default: () => new Date() },
}, { _id: false });

const PermissionSchema = new Schema({
  reportId  : { type: Schema.Types.ObjectId, ref: 'Report', required: true, index: true },
  grantedBy : { type: Schema.Types.ObjectId, ref: 'User',   required: true },
  grantedTo : { type: Schema.Types.ObjectId, ref: 'User',   required: true, index: true },
  permissions: {
    type: [{ type: String, enum: ['view','download','annotate','print'] }],
    required: true,
    validate: [(v) => v.length >= 1, 'At least one permission required'],
  },
  isRevoked     : { type: Boolean, default: false, index: true },
  revokedAt     : { type: Date, default: null },
  revokedReason : { type: String, maxlength: 500, default: null },
  expiresAt     : { type: Date, default: null },
  shareMessage  : { type: String, maxlength: 1000, default: null },
  notifiedAt    : { type: Date, default: null },
  accessLog     : { type: [AccessEventSchema], default: [] },
  viewCount     : { type: Number, default: 0 },
  downloadCount : { type: Number, default: 0 },
  lastAccessAt  : { type: Date, default: null },
}, {
  timestamps: true,
  toJSON: { virtuals: true },
});

// Indexes
PermissionSchema.index({ reportId: 1, grantedTo: 1 }, { unique: true });
PermissionSchema.index({ grantedTo: 1, isRevoked: 1, expiresAt: 1 });
PermissionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0, sparse: true });

// Virtuals
PermissionSchema.virtual('isActive').get(function () {
  if (this.isRevoked) return false;
  if (this.expiresAt && this.expiresAt < new Date()) return false;
  return true;
});

// Pre-save
PermissionSchema.pre('save', function (next) {
  this.permissions = [...new Set(this.permissions)];
  if (this.permissions.length > 0 && !this.permissions.includes('view')) {
    this.permissions.unshift('view');
  }
  next();
});

// Methods
PermissionSchema.methods.hasCapability = function (cap) {
  return this.isActive && this.permissions.includes(cap);
};
PermissionSchema.methods.revoke = function (reason) {
  this.isRevoked = true;
  this.revokedAt = new Date();
  this.revokedReason = reason || null;
};
PermissionSchema.methods.recordAccess = function (action, ip, ua) {
  this.accessLog.push({ action, ip, ua });
  if (this.accessLog.length > 50) this.accessLog.splice(0, this.accessLog.length - 50);
  this.lastAccessAt = new Date();
  if (action === 'view')     this.viewCount += 1;
  if (action === 'download') this.downloadCount += 1;
};

// Statics
PermissionSchema.statics.canAccess = async function (reportId, userId, capability = 'view') {
  const perm = await this.findOne({
    reportId, grantedTo: userId, isRevoked: false,
    $or: [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }],
  });
  return perm ? perm.permissions.includes(capability) : false;
};

PermissionSchema.statics.findActiveForGrantee = function (userId) {
  return this.find({
    grantedTo: userId, isRevoked: false,
    $or: [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }],
  }).populate('reportId', 'title status createdAt');
};

module.exports = model('Permission', PermissionSchema);
