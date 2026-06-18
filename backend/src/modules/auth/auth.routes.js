'use strict';

const router     = require('express').Router();
const controller = require('./auth.controller');
const { validate } = require('../../middleware/validate');
const { authenticate } = require('../../middleware/auth.middleware');
const { authLimiter, passwordResetLimiter } = require('../../middleware/rateLimiter');
const v = require('./auth.validation');

// Public routes
router.post('/register',         authLimiter,          validate(v.registerSchema),       controller.register);
router.post('/login',            authLimiter,          validate(v.loginSchema),          controller.login);
router.post('/refresh',                                                                   controller.refresh);
router.post('/verify-email',     validate(v.verifyEmailSchema),                          controller.verifyEmail);
router.post('/forgot-password',  passwordResetLimiter, validate(v.forgotPasswordSchema), controller.forgotPassword);
router.post('/reset-password',   passwordResetLimiter, validate(v.resetPasswordSchema),  controller.resetPassword);

// Protected routes
router.use(authenticate);
router.post('/logout',           controller.logout);
router.get('/me',                controller.me);
router.patch('/change-password', validate(v.changePasswordSchema), controller.changePassword);

module.exports = router;
