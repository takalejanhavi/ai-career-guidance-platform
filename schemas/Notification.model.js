'use strict';

/**
 * Notification Model
 * Multi-channel user notifications with template-based content,
 * delivery tracking, and per-user read state.
 *
 * Channels: in_app | email | push
 * Each Notification document represents one logical event
 * delivered across one or more channels.
 *
 * Relationships:
 *   - Notification (N) → User (1)    via Notification.userId   [recipient]
 *   - Notification (N) → User (1)    via Notification.actorId  [who triggered it, optional]
 *   - Notification (N) → Resource    via Notification.resourceId (polymorphic)
 */

const mongoose = require('mongoose');
const { Schema, model } = mongoose;

// ─── Constants ────────────────────────────────────────────────────────────────

const NOTIFICATION_TYPES = [
  // Assessment lifecycle
  'assessment.completed',
  'assessment.scored',

  // Report lifecycle
  'report.ready',
  'report.shared_with_you',        // psychologist receives this
  'report.share_accepted',         // student receives this (future)
  'report.blockchain_confirmed',
  'report.annotation_added',

  // Permission events
  'permission.granted',
  'permission.revoked',
  'permission.expiring_soon',

  // Account events
  'account.email_verified',
  'account.password_changed',
  'account.login_new_device',
  'account.suspended',

  // Psychologist events
  'psychologist.student_assigned',
  'psychologist.verification_approved',
  'psychologist.verification_rejected',

  // Admin / system
  'system.announcement',
  'system.maintenance',
];

// ─── Sub-schemas ──────────────────────────────────────────────────────────────

/** Delivery state per channel */
const ChannelDeliverySchema = new Schema(
  {
    channel: {
      type    : String,
      required: true,
      enum    : ['in_app', 'email', 'push'],
    },
    status: {
      type    : String,
      enum    : ['pending', 'sent', 'delivered', 'failed', 'skipped'],
      default : 'pending',
    },
    // External provider message ID (e.g. SendGrid message ID)
    externalId  : { type: String, maxlength: 200, default: null },
    sentAt      : { type: Date, default: null },
    deliveredAt : { type: Date, default: null },
    failedAt    : { type: Date, default: null },
    failReason  : { type: String, maxlength: 500, default: null },
    retryCount  : { type: Number, default: 0, min: 0, max: 5 },
    nextRetryAt : { type: Date, default: null },
  },
  { _id: false }
);

/** Rich action button for in-app and push notifications */
const ActionSchema = new Schema(
  {
    label   : { type: String, required: true, maxlength: 100 },
    url     : { type: String, required: true, maxlength: 500 },
    style   : { type: String, enum: ['primary', 'secondary', 'danger'], default: 'primary' },
  },
  { _id: false }
);

// ─── Main Schema ──────────────────────────────────────────────────────────────

const NotificationSchema = new Schema(
  {
    // ── Recipient ─────────────────────────────────────────────────────────────
    userId: {
      type    : Schema.Types.ObjectId,
      ref     : 'User',
      required: [true, 'userId (recipient) is required'],
      index   : true,
    },

    // Who triggered this notification (null = system-generated)
    actorId: {
      type   : Schema.Types.ObjectId,
      ref    : 'User',
      default: null,
    },

    // ── Content ───────────────────────────────────────────────────────────────
    type: {
      type    : String,
      required: [true, 'notification type is required'],
      enum    : {
        values : NOTIFICATION_TYPES,
        message: '{VALUE} is not a recognised notification type',
      },
      index: true,
    },

    title: {
      type     : String,
      required : [true, 'title is required'],
      maxlength: [200, 'title must not exceed 200 characters'],
      trim     : true,
    },

    body: {
      type     : String,
      required : [true, 'body is required'],
      maxlength: [2000, 'body must not exceed 2000 characters'],
    },

    // Short version for push notifications and notification tray
    summary: {
      type    : String,
      maxlength: 160,
      default : null,
    },

    // ── Resource link ─────────────────────────────────────────────────────────
    resourceType: {
      type   : String,
      enum   : ['Assessment', 'Report', 'Permission', 'User', null],
      default: null,
    },

    resourceId: {
      type   : Schema.Types.ObjectId,
      default: null,
      index  : true,
    },

    // Primary CTA for in-app notification
    actions: {
      type    : [ActionSchema],
      default : [],
      validate: {
        validator(v) { return v.length <= 3; },
        message  : 'Cannot specify more than 3 actions per notification',
      },
    },

    // ── Delivery ──────────────────────────────────────────────────────────────
    channels: {
      type    : [ChannelDeliverySchema],
      default : [],
      validate: {
        validator(v) {
          const channelNames = v.map(c => c.channel);
          return channelNames.length === new Set(channelNames).size;
        },
        message: 'Each channel must appear at most once',
      },
    },

    // ── Read state ────────────────────────────────────────────────────────────
    isRead    : { type: Boolean, default: false, index: true },
    readAt    : { type: Date, default: null },
    isDismissed: { type: Boolean, default: false },
    dismissedAt: { type: Date, default: null },

    // ── Priority ──────────────────────────────────────────────────────────────
    priority: {
      type   : String,
      enum   : ['low', 'normal', 'high', 'urgent'],
      default: 'normal',
    },

    // ── Scheduling ────────────────────────────────────────────────────────────
    /**
     * If set, the notification should not be delivered before this time.
     * The notification worker respects this for email/push channels.
     */
    scheduledFor: { type: Date, default: null },

    // ── Expiry ────────────────────────────────────────────────────────────────
    expiresAt: {
      type   : Date,
      default: () => new Date(Date.now() + 90 * 24 * 60 * 60 * 1000), // 90 days
      index  : true,
    },

    // ── Template reference ────────────────────────────────────────────────────
    templateId: { type: String, maxlength: 100, default: null },
    // Variables used to render the template (stored for re-render / debug)
    templateVars: { type: Schema.Types.Mixed, default: null },
  },
  {
    timestamps: true,
    versionKey: '__v',
    toJSON    : { virtuals: true },
    toObject  : { virtuals: true },
  }
);

// ─── Virtuals ─────────────────────────────────────────────────────────────────

NotificationSchema.virtual('isDelivered').get(function () {
  return this.channels.some(c => c.status === 'delivered' || c.status === 'sent');
});

NotificationSchema.virtual('hasFailedAllChannels').get(function () {
  return (
    this.channels.length > 0 &&
    this.channels.every(c => ['failed', 'skipped'].includes(c.status))
  );
});

NotificationSchema.virtual('isExpired').get(function () {
  return this.expiresAt && this.expiresAt < new Date();
});

// ─── Indexes ──────────────────────────────────────────────────────────────────

NotificationSchema.index({ userId: 1, isRead: 1, createdAt: -1 }, { name: 'idx_notifications_unread' });
NotificationSchema.index({ userId: 1, createdAt: -1 },            { name: 'idx_notifications_user_date' });
NotificationSchema.index({ type: 1, userId: 1 },                  { name: 'idx_notifications_type_user' });
NotificationSchema.index({ resourceId: 1, resourceType: 1 },     { sparse: true, name: 'idx_notifications_resource' });
NotificationSchema.index({ priority: 1, 'channels.status': 1 },  { name: 'idx_notifications_priority_status' });
// TTL: auto-remove expired notifications
NotificationSchema.index(
  { expiresAt: 1 },
  { expireAfterSeconds: 0, name: 'idx_notifications_ttl' }
);
// For the delivery worker: pending channels that are ready to send
NotificationSchema.index(
  { 'channels.status': 1, scheduledFor: 1, expiresAt: 1 },
  {
    partialFilterExpression: { 'channels.status': 'pending' },
    name: 'idx_notifications_pending_delivery',
  }
);

// ─── Pre-save Hook ────────────────────────────────────────────────────────────

NotificationSchema.pre('save', function (next) {
  // Auto-fill summary from body if not provided
  if (!this.summary && this.body) {
    this.summary = this.body.slice(0, 160);
  }
  next();
});

// ─── Instance Methods ─────────────────────────────────────────────────────────

NotificationSchema.methods.markRead = function () {
  if (!this.isRead) {
    this.isRead = true;
    this.readAt  = new Date();
  }
};

NotificationSchema.methods.dismiss = function () {
  this.isDismissed  = true;
  this.dismissedAt  = new Date();
  if (!this.isRead) this.markRead();
};

NotificationSchema.methods.updateChannel = function (channel, update) {
  const ch = this.channels.find(c => c.channel === channel);
  if (ch) Object.assign(ch, update);
};

NotificationSchema.methods.markChannelSent = function (channel, externalId = null) {
  this.updateChannel(channel, { status: 'sent', sentAt: new Date(), externalId });
};

NotificationSchema.methods.markChannelFailed = function (channel, reason) {
  const ch = this.channels.find(c => c.channel === channel);
  if (!ch) return;
  ch.status      = 'failed';
  ch.failedAt    = new Date();
  ch.failReason  = reason;
  ch.retryCount += 1;
  if (ch.retryCount < 5) {
    // Exponential back-off: 2^retryCount minutes
    ch.nextRetryAt = new Date(Date.now() + Math.pow(2, ch.retryCount) * 60 * 1000);
    ch.status      = 'pending';
  }
};

// ─── Static Methods ───────────────────────────────────────────────────────────

NotificationSchema.statics.countUnread = function (userId) {
  return this.countDocuments({ userId, isRead: false, isDismissed: false });
};

NotificationSchema.statics.markAllReadForUser = function (userId) {
  return this.updateMany(
    { userId, isRead: false },
    { $set: { isRead: true, readAt: new Date() } }
  );
};

NotificationSchema.statics.findPendingDelivery = function (channel, limit = 100) {
  return this.find({
    'channels': { $elemMatch: { channel, status: 'pending', $or: [{ nextRetryAt: null }, { nextRetryAt: { $lte: new Date() } }] } },
    expiresAt : { $gt: new Date() },
    $or       : [{ scheduledFor: null }, { scheduledFor: { $lte: new Date() } }],
  }).limit(limit);
};

// ─── Export ───────────────────────────────────────────────────────────────────

module.exports = model('Notification', NotificationSchema);
module.exports.NOTIFICATION_TYPES = NOTIFICATION_TYPES;
