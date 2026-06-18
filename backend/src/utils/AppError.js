'use strict';

/**
 * Operational errors — safe to expose to clients.
 * Programming errors (bugs) should bubble up as plain Errors.
 */
class AppError extends Error {
  /**
   * @param {string}  message     Human-readable error message
   * @param {number}  statusCode  HTTP status code
   * @param {string}  [code]      Machine-readable error code for clients
   * @param {object}  [meta]      Extra context (field errors, etc.)
   */
  constructor(message, statusCode = 500, code = null, meta = null) {
    super(message);
    this.name         = 'AppError';
    this.statusCode   = statusCode;
    this.status       = statusCode >= 500 ? 'error' : 'fail';
    this.code         = code || httpCodeToSlug(statusCode);
    this.meta         = meta;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }

  // ── Factory helpers ─────────────────────────────────────────────────────────

  static badRequest(message, code, meta)  { return new AppError(message, 400, code, meta); }
  static unauthorized(message = 'Unauthorized')  { return new AppError(message, 401, 'UNAUTHORIZED'); }
  static forbidden(message = 'Forbidden')        { return new AppError(message, 403, 'FORBIDDEN'); }
  static notFound(resource = 'Resource')         { return new AppError(`${resource} not found`, 404, 'NOT_FOUND'); }
  static conflict(message, code)          { return new AppError(message, 409, code || 'CONFLICT'); }
  static unprocessable(message, meta)     { return new AppError(message, 422, 'VALIDATION_ERROR', meta); }
  static tooManyRequests(message = 'Too many requests') { return new AppError(message, 429, 'RATE_LIMITED'); }
  static internal(message = 'Internal server error')    { return new AppError(message, 500, 'INTERNAL_ERROR'); }
  static serviceUnavailable(service)      { return new AppError(`${service} is temporarily unavailable`, 503, 'SERVICE_UNAVAILABLE'); }
}

function httpCodeToSlug(code) {
  const map = { 400: 'BAD_REQUEST', 401: 'UNAUTHORIZED', 403: 'FORBIDDEN', 404: 'NOT_FOUND', 409: 'CONFLICT', 422: 'VALIDATION_ERROR', 429: 'RATE_LIMITED', 500: 'INTERNAL_ERROR', 503: 'SERVICE_UNAVAILABLE' };
  return map[code] || 'UNKNOWN_ERROR';
}

module.exports = AppError;
