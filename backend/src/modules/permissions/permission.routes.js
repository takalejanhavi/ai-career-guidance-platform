'use strict';

const { z }      = require('zod');
const router     = require('express').Router();
const ctrl       = require('./permission.controller');
const { authenticate } = require('../../middleware/auth.middleware');
const { authorize }    = require('../../middleware/rbac.middleware');
const { validate, idParamSchema } = require('../../middleware/validate');
const { objectIdSchema } = require('../../middleware/validate');

const grantSchema = z.object({
  grantedToEmail : z.string().email(),
  permissions    : z.array(z.enum(['view','download','annotate','print'])).min(1),
  expiresAt      : z.string().datetime().optional(),
  shareMessage   : z.string().max(1000).optional(),
});

const updateSchema = z.object({
  permissions : z.array(z.enum(['view','download','annotate','print'])).min(1).optional(),
  expiresAt   : z.string().datetime().nullable().optional(),
});

const revokeSchema = z.object({ reason: z.string().max(500).optional() });

const reportIdParam = z.object({ reportId: objectIdSchema });

router.use(authenticate);

router.get('/shared-with-me',                                            ctrl.getMySharedReports);
router.get('/report/:reportId',    validate(reportIdParam, 'params'),   ctrl.listPermissions);
router.post('/report/:reportId',   authorize('student'), validate(reportIdParam, 'params'), validate(grantSchema), ctrl.grantPermission);
router.patch('/:id',               validate(idParamSchema, 'params'), validate(updateSchema), ctrl.updatePermission);
router.delete('/:id',              validate(idParamSchema, 'params'), validate(revokeSchema), ctrl.revokePermission);

module.exports = router;
