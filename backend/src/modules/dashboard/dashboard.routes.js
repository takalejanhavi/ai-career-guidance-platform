'use strict';

// ─── Controller ───────────────────────────────────────────────────────────────

const service    = require('./dashboard.service');
const { success } = require('../../utils/apiResponse');
const catchAsync  = require('../../utils/catchAsync');
const AppError    = require('../../utils/AppError');

const getDashboard = catchAsync(async (req, res) => {
  let data;
  switch (req.user.role) {
    case 'student':       data = await service.getStudentDashboard(req.user._id);        break;
    case 'psychologist':  data = await service.getPsychologistDashboard(req.user._id);   break;
    case 'admin':         data = await service.getAdminDashboard();                       break;
    default: throw AppError.forbidden('Unknown role');
  }
  success(res, data);
});

const getAdminOverview = catchAsync(async (req, res) => {
  const data = await service.getAdminDashboard();
  success(res, data);
});

const getTrends = catchAsync(async (req, res) => {
  const data = await service.getAssessmentTrends(req.query);
  success(res, { trends: data });
});

const ctrl = { getDashboard, getAdminOverview, getTrends };

// ─── Routes ───────────────────────────────────────────────────────────────────

const router = require('express').Router();
const { authenticate } = require('../../middleware/auth.middleware');
const { authorize }    = require('../../middleware/rbac.middleware');
const { validate }     = require('../../middleware/validate');
const { z }            = require('zod');

const trendsQuery = z.object({
  from: z.string().datetime().optional(),
  to:   z.string().datetime().optional(),
});

router.use(authenticate);
router.get('/',        ctrl.getDashboard);
router.get('/admin',   authorize('admin'), ctrl.getAdminOverview);
router.get('/trends',  authorize('admin'), validate(trendsQuery, 'query'), ctrl.getTrends);

module.exports = router;
