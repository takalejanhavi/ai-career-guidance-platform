'use strict';

const mongoose = require('mongoose');
const { Schema, model } = mongoose;

const AUDIT_ACTIONS = [
  'auth.register','auth.login','auth.login_failed','auth.logout','auth.token_refresh',
  'auth.password_reset_requested','auth.password_reset_completed','auth.email_verified',
  'auth.account_locked','user.profile_updated','user.role_changed','user.suspended','user.deleted',
  'assessment.started','assessment.submitted','assessment.scored','assessment.deleted',
  'report.generated','report.viewed','report.pdf_downloaded','report.visibility_changed',
  'report.deleted','report.annotation_added',
  'permission.granted','permission.revoked','permission.accessed',
  'blockchain.anchor_initiated','blockchain.anchor_confirmed','blockchain.anchor_failed',
  'psychologist.student_assigned','psychologist.verified','psychologist.rejected',
  'admin.bulk_export','admin.config_changed',
];

const AuditLogSchema = new Schema({
  actorId       : { type: Schema.Types.ObjectId, ref: 'User', default: null, index: true },
  actorRole     : { type: String, enum: ['student','psychologist','admin','system'], required: true },
  actorEmail    : { type: String, maxlength: 254, default: null },
  action        : { type: String, required: true, enum: AUDIT_ACTIONS, index: true },
  resourceType  : { type: String, enum: ['User','Assessment','Report','Permission','Psychologist','System'], required: true },
  resourceId    : { type: Schema.Types.ObjectId, default: null, index: true },
  targetId      : { type: Schema.Types.ObjectId, default: null },
  outcome       : { type: String, enum: ['success','failure','partial'], required: true },
  message       : { type: String, maxlength: 1000, default: null },
  metadata      : { type: Schema.Types.Mixed, default: null },
  diff          : { type: [{ field: String, before: Schema.Types.Mixed, after: Schema.Types.Mixed }], default: [] },
  requestContext: { type: { method: String, path: String, ip: String, userAgent: String, requestId: String }, default: null },
  occurredAt    : { type: Date, default: () => new Date() },
  severity      : { type: String, enum: ['debug','info','warn','critical'], default: 'info', index: true },
}, { timestamps: { createdAt: true, updatedAt: false }, versionKey: false });

// Indexes
AuditLogSchema.index({ actorId: 1, occurredAt: -1 });
AuditLogSchema.index({ action: 1, occurredAt: -1 });
AuditLogSchema.index({ resourceType: 1, resourceId: 1, occurredAt: -1 });
AuditLogSchema.index({ occurredAt: 1 }, { expireAfterSeconds: 63072000 }); // 2yr TTL

// Immutability
AuditLogSchema.pre('save', function (next) {
  if (!this.isNew) return next(new Error('AuditLog is immutable'));
  next();
});
AuditLogSchema.pre(['updateOne','updateMany','findOneAndUpdate'], function (next) {
  next(new Error('AuditLog is immutable'));
});

// Factory
AuditLogSchema.statics.write = function (data) {
  const { actor, ...rest } = data;
  return this.create({
    actorId    : actor?._id    || null,
    actorRole  : rest.actorRole || actor?.role || 'system',
    actorEmail : rest.actorEmail || actor?.email || null,
    ...rest,
    occurredAt : new Date(),
  });
};

module.exports = model('AuditLog', AuditLogSchema);
module.exports.AUDIT_ACTIONS = AUDIT_ACTIONS;
