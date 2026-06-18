'use strict';

/**
 * Wraps an async Express handler so unhandled promise rejections
 * are forwarded to Express's next(err) error pipeline.
 *
 * @param {Function} fn  Async (req, res, next) => Promise
 * @returns {Function}   Express middleware
 */
const catchAsync = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

module.exports = catchAsync;
