'use strict';

// ─── Controller ───────────────────────────────────────────────────────────────

const service    = require('./psychologist.service');
const { success, created, noContent, paginated } = require('../../utils/apiResponse');
const catchAsync = require('../../utils/catchAsync');

const getMyProfile = catchAsync(async (req, res) => {
  const profile = await service.getMyProfile(req.user._id);
  success(res, { profile });
});

const updateProfile = catchAsync(async (req, res) => {
  const profile = await service.updateProfile(req.user._id, req.body);
  success(res, { profile });
});

const submitForVerification = catchAsync(async (req, res) => {
  const profile = await service.submitForVerification(req.user._id, req.body.credentials);
  success(res, { profile }, { message: 'Verification submitted. An admin will review your credentials.' });
});

const approveVerification = catchAsync(async (req, res) => {
  const profile = await service.approveVerification(req.params.id, req.user._id);
  success(res, { profile });
});

const rejectVerification = catchAsync(async (req, res) => {
  const profile = await service.rejectVerification(req.params.id, req.user._id, req.body.note);
  success(res, { profile });
});

const assignStudent = catchAsync(async (req, res) => {
  const profile = await service.assignStudent(req.user._id, req.params.studentId);
  success(res, { profile });
});

const unassignStudent = catchAsync(async (req, res) => {
  const profile = await service.unassignStudent(req.user._id, req.params.studentId);
  noContent(res);
});

const listPending = catchAsync(async (req, res) => {
  const result = await service.listPendingVerifications(req.query);
  paginated(res, result.data, result);
});

const listAvailable = catchAsync(async (req, res) => {
  const result = await service.listAvailable(req.query);
  paginated(res, result.data, result);
});

const ctrl = {
  getMyProfile, updateProfile, submitForVerification,
  approveVerification, rejectVerification,
  assignStudent, unassignStudent,
  listPending, listAvailable,
};

// ─── Routes ───────────────────────────────────────────────────────────────────

const { z }      = require('zod');
const router     = require('express').Router();
const { authenticate }  = require('../../middleware/auth.middleware');
const { authorize }     = require('../../middleware/rbac.middleware');
const { validate, idParamSchema, paginationSchema } = require('../../middleware/validate');
const { objectIdSchema } = require('../../middleware/validate');

const updateProfileSchema = z.object({
  title             : z.string().max(50).optional(),
  specializations   : z.array(z.string().max(100)).max(20).optional(),
  yearsOfExperience : z.number().min(0).max(70).optional(),
  languages         : z.array(z.string().max(10)).max(15).optional(),
  professionalEmail : z.string().email().max(254).optional().nullable(),
  websiteUrl        : z.string().url().max(500).optional().nullable(),
  linkedinUrl       : z.string().max(500).optional().nullable(),
  isAcceptingStudents: z.boolean().optional(),
  maxStudentCapacity : z.number().int().min(1).max(500).optional(),
  availability      : z.array(z.object({
    dayOfWeek : z.number().int().min(0).max(6),
    startTime : z.string().regex(/^\d{2}:\d{2}$/),
    endTime   : z.string().regex(/^\d{2}:\d{2}$/),
    timezone  : z.string().max(100),
  })).max(28).optional(),
});

const credentialSchema = z.object({
  credentials: z.array(z.object({
    type         : z.string().min(1).max(100),
    issuingBody  : z.string().min(1).max(200),
    licenseNumber: z.string().max(100).optional(),
    issuedAt     : z.string().datetime().optional(),
    expiresAt    : z.string().datetime().optional(),
  })).min(1).max(10),
});

const rejectSchema   = z.object({ note: z.string().min(1).max(1000) });
const studentIdParam = z.object({ studentId: objectIdSchema });
const listQuery      = paginationSchema.extend({
  specialization: z.string().max(100).optional(),
  language      : z.string().max(10).optional(),
});

router.use(authenticate);

// Authenticated psychologist
router.get('/me',                  authorize('psychologist'), ctrl.getMyProfile);
router.patch('/me',                authorize('psychologist'), validate(updateProfileSchema), ctrl.updateProfile);
router.post('/me/verify',          authorize('psychologist'), validate(credentialSchema), ctrl.submitForVerification);
router.post('/me/students/:studentId', authorize('psychologist'), validate(studentIdParam, 'params'), ctrl.assignStudent);
router.delete('/me/students/:studentId', authorize('psychologist'), validate(studentIdParam, 'params'), ctrl.unassignStudent);

// Public (authenticated)
router.get('/available',           validate(listQuery, 'query'), ctrl.listAvailable);

// Admin only
router.get('/pending',             authorize('admin'), validate(paginationSchema, 'query'), ctrl.listPending);
router.patch('/:id/approve',       authorize('admin'), validate(idParamSchema, 'params'), ctrl.approveVerification);
router.patch('/:id/reject',        authorize('admin'), validate(idParamSchema, 'params'), validate(rejectSchema), ctrl.rejectVerification);

module.exports = router;
