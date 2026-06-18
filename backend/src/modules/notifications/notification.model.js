'use strict';

const mongoose = require('mongoose');
const { Schema, model } = mongoose;

const TYPES = ['assessment.completed','assessment.scored','report.ready','report.shared_with_you',
  'report.blockchain_confirmed','report.annotation_added','permission.granted','permission.revoked',
  'permission.expiring_soon','account.email_verified','account.password_changed','account.login_new_device',
  'account.suspended','psychologist.student_assigned','psychologist.verification_approved',
  'psychologist.verification_rejected','system.announcement','system.maintenance'];

const ChannelSchema = new Schema({
  channel    : { type: String, enum: ['in_app','email','push'], required: true },
  status     : { type: String, enum: ['pending','sent','delivered','failed','skipped'], default: 'pending' },
  externalId : { type: String, maxlength: 200, default: null },
  sentAt     : { type: Date, default: null },
  failReason : { type: String, maxlength: 500, default: null },
  retryCount : { type: Number, default: 0 },
  nextRetryAt: { type: Date, default: null },
}, { _id: false });

const NotificationSchema = new Schema({
  userId       : { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  actorId      : { type: Schema.Types.ObjectId, ref: 'User', default: null },
  type         : { type: String, required: true, enum: TYPES, index: true },
  title        : { type: String, required: true, maxlength: 200 },
  body         : { type: String, required: true, maxlength: 2000 },
  summary      : { type: String, maxlength: 160, default: null },
  resourceType : { type: String, enum: ['Assessment','Report','Permission','User', null], default: null },
  resourceId   : { type: Schema.Types.ObjectId, default: null },
  actions      : { type: [{ label: String, url: String, style: { type: String, default: 'primary' } }], default: [] },
  channels     : { type: [ChannelSchema], default: [] },
  isRead       : { type: Boolean, default: false, index: true },
  readAt       : { type: Date, default: null },
  isDismissed  : { type: Boolean, default: false },
  priority     : { type: String, enum: ['low','normal','high','urgent'], default: 'normal' },
  scheduledFor : { type: Date, default: null },
  expiresAt    : { type: Date, default: () => new Date(Date.now() + 90 * 24 * 60 * 60 * 1000) },
}, { timestamps: true });

NotificationSchema.index({ userId: 1, isRead: 1, createdAt: -1 });
NotificationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

NotificationSchema.pre('save', function (next) {
  if (!this.summary && this.body) this.summary = this.body.slice(0, 160);
  next();
});

NotificationSchema.methods.markRead = function () {
  if (!this.isRead) { this.isRead = true; this.readAt = new Date(); }
};

NotificationSchema.statics.countUnread = function (userId) {
  return this.countDocuments({ userId, isRead: false, isDismissed: false });
};

NotificationSchema.statics.markAllReadForUser = function (userId) {
  return this.updateMany({ userId, isRead: false }, { $set: { isRead: true, readAt: new Date() } });
};

module.exports = model('Notification', NotificationSchema);
module.exports.NOTIFICATION_TYPES = TYPES;
