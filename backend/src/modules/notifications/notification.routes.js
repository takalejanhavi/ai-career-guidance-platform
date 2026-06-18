'use strict';

// ─── Controller ───────────────────────────────────────────────────────────────

const service    = require('./notification.service');
const { success, noContent, paginated } = require('../../utils/apiResponse');
const catchAsync = require('../../utils/catchAsync');

const getMyNotifications = catchAsync(async (req, res) => {
  const result = await service.getMyNotifications(req.user._id, req.query);
  paginated(res, result.data, { ...result, total: result.total });
});

const markRead = catchAsync(async (req, res) => {
  const notif = await service.markRead(req.params.id, req.user._id);
  success(res, { notification: notif });
});

const markAllRead = catchAsync(async (req, res) => {
  await service.markAllRead(req.user._id);
  noContent(res);
});

const dismiss = catchAsync(async (req, res) => {
  const notif = await service.dismiss(req.params.id, req.user._id);
  success(res, { notification: notif });
});

const deleteNotification = catchAsync(async (req, res) => {
  await service.deleteNotification(req.params.id, req.user._id);
  noContent(res);
});

const controller = { getMyNotifications, markRead, markAllRead, dismiss, deleteNotification };

// ─── Routes ───────────────────────────────────────────────────────────────────

const router = require('express').Router();
const { authenticate } = require('../../middleware/auth.middleware');
const { validate, idParamSchema, paginationSchema } = require('../../middleware/validate');
const { z } = require('zod');

const querySchema = paginationSchema.extend({ unreadOnly: z.coerce.boolean().default(false) });

router.use(authenticate);
router.get('/',              validate(querySchema, 'query'),         controller.getMyNotifications);
router.patch('/read-all',                                             controller.markAllRead);
router.patch('/:id/read',    validate(idParamSchema, 'params'),      controller.markRead);
router.patch('/:id/dismiss', validate(idParamSchema, 'params'),      controller.dismiss);
router.delete('/:id',        validate(idParamSchema, 'params'),      controller.deleteNotification);

module.exports = router;
