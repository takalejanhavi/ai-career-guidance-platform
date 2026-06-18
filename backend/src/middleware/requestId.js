'use strict';

const { randomUUID } = require('crypto');

/**
 * Attaches req.id and sets X-Request-ID response header.
 * Uses existing X-Request-ID header if provided by a proxy/gateway.
 */
module.exports = function requestId(req, res, next) {
  req.id = req.headers['x-request-id'] || randomUUID();
  res.setHeader('X-Request-ID', req.id);
  next();
};
