'use strict';

const rateLimit = require('express-rate-limit');
const env       = require('../config/env');

const defaults = {
  standardHeaders: true,
  legacyHeaders:   false,
  message: {
    status:  'fail',
    code:    'RATE_LIMITED',
    message: 'Too many requests. Please slow down and try again.',
  },
};

/** General API rate limit */
const apiLimiter = rateLimit({
  ...defaults,
  windowMs : env.RATE_LIMIT_WINDOW_MS,
  max      : env.RATE_LIMIT_MAX,
});

/** Strict limit for auth endpoints */
const authLimiter = rateLimit({
  ...defaults,
  windowMs  : 15 * 60 * 1000,  // 15 minutes
  max       : env.AUTH_RATE_LIMIT_MAX,
  message   : { ...defaults.message, message: 'Too many auth attempts. Please wait 15 minutes.' },
  skipSuccessfulRequests: true,
});

/** Very strict limit for password reset */
const passwordResetLimiter = rateLimit({
  ...defaults,
  windowMs : 60 * 60 * 1000, // 1 hour
  max      : 3,
});

/** PDF generation — expensive operations */
const pdfLimiter = rateLimit({
  ...defaults,
  windowMs : 60 * 60 * 1000, // 1 hour
  max      : 10,
});

module.exports = { apiLimiter, authLimiter, passwordResetLimiter, pdfLimiter };
