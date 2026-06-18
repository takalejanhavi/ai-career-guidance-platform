'use strict';

const router     = require('express').Router();
const ctrl       = require('./user.controller');
const { authenticate }           = require('../../middleware/auth.middleware');
const { authorize, selfOrAdmin } = require('../../middleware/rbac.middleware');
const { validate, idParamSchema, paginationSchema } = require('../../middleware/validate');
const v = require('./user.validation');

router.use(authenticate);

// ── Self-service ──────────────────────────────────────────────────────────────
router.get('/me',         ctrl.getMyProfile);
router.patch('/me',       validate(v.updateProfileSchema), ctrl.updateMyProfile);

// ── Admin: user management ────────────────────────────────────────────────────
router.get('/',
  authorize('admin'),
  validate(v.listUsersQuerySchema, 'query'),
  ctrl.listUsers
);

router.get('/:id',
  validate(idParamSchema, 'params'),
  selfOrAdmin,
  ctrl.getUserById
);

router.patch('/:id/role',
  authorize('admin'),
  validate(idParamSchema, 'params'),
  validate(v.changeRoleSchema),
  ctrl.changeRole
);

router.patch('/:id/suspend',
  authorize('admin'),
  validate(idParamSchema, 'params'),
  validate(v.suspendSchema),
  ctrl.suspendUser
);

router.patch('/:id/unsuspend',
  authorize('admin'),
  validate(idParamSchema, 'params'),
  ctrl.unsuspendUser
);

router.delete('/:id',
  authorize('admin'),
  validate(idParamSchema, 'params'),
  ctrl.deleteUser
);

router.get('/:id/audit',
  authorize('admin'),
  validate(idParamSchema, 'params'),
  validate(paginationSchema, 'query'),
  ctrl.getUserAuditLog
);

module.exports = router;
