'use strict';

const AppError = require('../utils/AppError');

/**
 * Role guard — restricts a route to one or more roles.
 *
 * Usage:
 *   router.get('/admin-only', authenticate, authorize('admin'), handler);
 *   router.get('/staff',      authenticate, authorize('admin', 'psychologist'), handler);
 */
const authorize = (...roles) => (req, res, next) => {
  if (!req.user) return next(AppError.unauthorized());
  if (!roles.includes(req.user.role)) {
    return next(AppError.forbidden(
      `Role '${req.user.role}' does not have access to this resource`
    ));
  }
  next();
};

/**
 * Resource ownership guard.
 * Verifies that req.user._id matches the resource's owner field.
 * Admin always passes.
 *
 * @param {Function} getOwnerId  (req) => ObjectId | string | null
 *
 * Usage:
 *   router.delete('/:id', authenticate, ownerOrAdmin(req => req.resource.userId), handler);
 */
const ownerOrAdmin = (getOwnerId) => (req, res, next) => {
  if (!req.user) return next(AppError.unauthorized());
  if (req.user.role === 'admin') return next();

  const ownerId = getOwnerId(req);
  if (!ownerId) return next(AppError.notFound('Resource'));

  if (String(ownerId) !== String(req.user._id)) {
    return next(AppError.forbidden('You do not have permission to access this resource'));
  }
  next();
};

/**
 * Self-only guard — user can only access their own records.
 * Admin passes through.
 *
 * Usage:
 *   router.get('/:userId/profile', authenticate, selfOrAdmin, handler);
 */
const selfOrAdmin = (req, res, next) => {
  if (!req.user) return next(AppError.unauthorized());
  if (req.user.role === 'admin') return next();

  const targetId = req.params.userId || req.params.id;
  if (String(targetId) !== String(req.user._id)) {
    return next(AppError.forbidden('You can only access your own data'));
  }
  next();
};

/**
 * Psychologist or admin guard with optional ownership check.
 */
const psychologistOrAdmin = (req, res, next) => {
  if (!req.user) return next(AppError.unauthorized());
  if (['psychologist', 'admin'].includes(req.user.role)) return next();
  return next(AppError.forbidden('Psychologists and admins only'));
};

module.exports = { authorize, ownerOrAdmin, selfOrAdmin, psychologistOrAdmin };
