'use strict';

const Notification = require('./notification.model');
const AppError     = require('../../utils/AppError');

// ─── Service ──────────────────────────────────────────────────────────────────

async function create({ userId, type, title, body, resourceType, resourceId, actions, channels, priority, actorId }) {
  return Notification.create({
    userId, type, title, body,
    resourceType: resourceType || null,
    resourceId:   resourceId   || null,
    actions:      actions      || [],
    channels:     (channels || ['in_app']).map(c => ({ channel: c, status: 'pending' })),
    priority:     priority     || 'normal',
    actorId:      actorId      || null,
  });
}

async function getMyNotifications(userId, { page = 1, limit = 20, unreadOnly = false }) {
  const filter = { userId };
  if (unreadOnly) filter.isRead = false;

  const [data, total, unreadCount] = await Promise.all([
    Notification.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit),
    Notification.countDocuments(filter),
    Notification.countUnread(userId),
  ]);

  return { data, total, page, limit, unreadCount };
}

async function markRead(notificationId, userId) {
  const notif = await Notification.findOne({ _id: notificationId, userId });
  if (!notif) throw AppError.notFound('Notification');
  notif.markRead();
  return notif.save();
}

async function markAllRead(userId) {
  await Notification.markAllReadForUser(userId);
}

async function dismiss(notificationId, userId) {
  const notif = await Notification.findOne({ _id: notificationId, userId });
  if (!notif) throw AppError.notFound('Notification');
  notif.isDismissed = true;
  notif.markRead();
  return notif.save();
}

async function deleteNotification(notificationId, userId) {
  const result = await Notification.deleteOne({ _id: notificationId, userId });
  if (result.deletedCount === 0) throw AppError.notFound('Notification');
}

module.exports = { create, getMyNotifications, markRead, markAllRead, dismiss, deleteNotification };
