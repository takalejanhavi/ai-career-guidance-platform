'use strict';

/**
 * Standardised JSON envelope for all API responses.
 *
 * Success shape:
 *   { status: 'success', data: {...}, meta: {...} }
 *
 * Fail / error shape handled by errorHandler middleware.
 */

const success = (res, data = null, { statusCode = 200, message = null, meta = null } = {}) => {
  const body = { status: 'success' };
  if (message)            body.message = message;
  if (data !== null)      body.data    = data;
  if (meta !== null)      body.meta    = meta;
  return res.status(statusCode).json(body);
};

const created = (res, data, message = null) =>
  success(res, data, { statusCode: 201, message });

const noContent = (res) => res.status(204).send();

const paginated = (res, data, { page, limit, total }) =>
  success(res, data, {
    meta: {
      page:       Number(page),
      limit:      Number(limit),
      total:      Number(total),
      totalPages: Math.ceil(total / limit),
    },
  });

module.exports = { success, created, noContent, paginated };
