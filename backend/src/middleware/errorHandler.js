'use strict';

const mongoose = require('mongoose');
const jwt      = require('jsonwebtoken');
const AppError = require('../utils/AppError');
const logger   = require('../config/logger');

// ─── Error type normalizers ───────────────────────────────────────────────────

function handleCastError(err) {
  return AppError.badRequest(`Invalid value for field '${err.path}': ${err.value}`, 'INVALID_ID');
}

function handleDuplicateKeyError(err) {
  const field = Object.keys(err.keyValue || {})[0] || 'field';
  const value = err.keyValue?.[field];
  return AppError.conflict(`${field} '${value}' is already in use`, 'DUPLICATE_VALUE');
}

function handleValidationError(err) {
  const errors = Object.values(err.errors).map(e => ({
    field:   e.path,
    message: e.message,
  }));
  return AppError.unprocessable('Validation failed', errors);
}

function handleJWTError() {
  return AppError.unauthorized('Invalid token. Please log in again.');
}

function handleJWTExpiredError() {
  return AppError.unauthorized('Your session has expired. Please log in again.');
}

// ─── Main handler ─────────────────────────────────────────────────────────────

module.exports = function errorHandler(err, req, res, next) { // eslint-disable-line no-unused-vars
  let error = err;

  // Normalise well-known error types into AppErrors
  if (err instanceof mongoose.Error.CastError)       error = handleCastError(err);
  if (err.code === 11000)                            error = handleDuplicateKeyError(err);
  if (err instanceof mongoose.Error.ValidationError) error = handleValidationError(err);
  if (err instanceof jwt.JsonWebTokenError)          error = handleJWTError();
  if (err instanceof jwt.TokenExpiredError)          error = handleJWTExpiredError();

  const statusCode = error.statusCode || 500;
  const isOperational = error.isOperational === true;

  // Log non-operational (programming) errors in full
  if (!isOperational || statusCode >= 500) {
    logger.error('Unhandled error', {
      message:    err.message,
      stack:      err.stack,
      url:        req.originalUrl,
      method:     req.method,
      userId:     req.user?._id,
      requestId:  req.id,
    });
  }

  // Never leak internals in production
  const message = isOperational
    ? error.message
    : 'Something went wrong. Please try again later.';

  const body = {
    status:    error.status || 'error',
    code:      error.code   || 'INTERNAL_ERROR',
    message,
  };

  if (error.meta)                        body.errors    = error.meta;
  if (process.env.NODE_ENV !== 'production' && !isOperational) {
    body.stack = err.stack;
  }

  res.status(statusCode).json(body);
};
