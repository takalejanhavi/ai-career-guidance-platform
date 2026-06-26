'use strict';

const { z }      = require('zod');
const router     = require('express').Router();
const ctrl       = require('./permission.controller');
const { authenticate } = require('../../middleware/auth.middleware');
const { authorize }    = require('../../middleware/rbac.middleware');
const { validate, idParamSchema } = require('../../middleware/validate');
const { objectIdSchema } = require('../../middleware/validate');

// Accepts YYYY-MM-DD (HTML date input), full ISO datetime, or absent/empty.
// z.string().datetime() required a full UTC ISO string — HTML <input type="date">
// sends "YYYY-MM-DD" (no time) or "" (when blank), both of which fail datetime().
// z.preprocess normalises "" → undefined before the coerce step.
const dateOrUndefined = z.preprocess(
  v => (v === '' || v == null) ? undefined : v,
  z.coerce.date().optional()
);

// Nullable variant for PATCH: explicit null clears the expiry; "" also clears it.
const dateOrNullOrUndefined = z.preprocess(
  v => (v === '') ? null : v == null ? undefined : v,
  z.union([z.null(), z.coerce.date()]).optional()
);

const grantSchema = z.object({
  grantedToEmail : z.string().email(),
  permissions    : z.array(z.enum(['view','download','annotate','print'])).min(1),
  expiresAt      : dateOrUndefined,
  shareMessage   : z.string().max(1000).optional(),
});

const updateSchema = z.object({
  permissions : z.array(z.enum(['view','download','annotate','print'])).min(1).optional(),
  expiresAt   : dateOrNullOrUndefined,
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
