'use strict';

const { z }    = require('zod');
const AppError = require('../utils/AppError');

/**
 * Creates an Express middleware that validates req.body, req.params,
 * and/or req.query against a Zod schema.
 *
 * @param {z.ZodSchema} schema
 * @param {'body'|'params'|'query'} [target='body']
 *
 * @example
 * router.post('/login', validate(loginSchema), authController.login);
 * router.get('/:id',   validate(idSchema, 'params'), controller.getOne);
 */
const validate = (schema, target = 'body') => (req, res, next) => {
  const result = schema.safeParse(req[target]);

  if (!result.success) {
    const errors = result.error.issues.map(i => ({
      field:   i.path.join('.'),
      message: i.message,
      code:    i.code,
    }));
    return next(AppError.unprocessable('Validation failed', errors));
  }

  // Replace the target with the parsed (coerced + stripped) data
  req[target] = result.data;
  next();
};

// ─── Shared reusable Zod schemas ──────────────────────────────────────────────

const objectIdSchema = z
  .string()
  .regex(/^[a-f\d]{24}$/i, 'Invalid MongoDB ObjectId')
  .transform(v => v.toLowerCase());

const idParamSchema = z.object({ id: objectIdSchema });

const paginationSchema = z.object({
  page:  z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  sort:  z.string().max(100).optional(),
  order: z.enum(['asc', 'desc']).default('desc'),
});

module.exports = { validate, objectIdSchema, idParamSchema, paginationSchema };
