'use strict';

const { z } = require('zod');

const passwordSchema = z
  .string()
  .min(8,  'Password must be at least 8 characters')
  .max(128, 'Password must not exceed 128 characters')
  .regex(/[A-Z]/,    'Password must contain at least one uppercase letter')
  .regex(/[a-z]/,    'Password must contain at least one lowercase letter')
  .regex(/[0-9]/,    'Password must contain at least one number')
  .regex(/[^A-Za-z0-9]/, 'Password must contain at least one special character');

const emailSchema = z
  .string()
  .email('Invalid email address')
  .max(254)
  .transform(v => v.toLowerCase().trim());

exports.registerSchema = z.object({
  firstName : z.string().min(1).max(100).trim(),
  lastName  : z.string().min(1).max(100).trim(),
  email     : emailSchema,
  password  : passwordSchema,
  role      : z.enum(['student', 'psychologist'], { errorMap: () => ({ message: 'Role must be student or psychologist' }) }),
  phone     : z.string().max(20).optional(),
});

exports.loginSchema = z.object({
  email    : emailSchema,
  password : z.string().min(1, 'Password is required').max(128),
});

exports.forgotPasswordSchema = z.object({
  email: emailSchema,
});

exports.resetPasswordSchema = z.object({
  token           : z.string().min(1, 'Token is required'),
  password        : passwordSchema,
  confirmPassword : z.string(),
}).refine(d => d.password === d.confirmPassword, {
  message: 'Passwords do not match',
  path:    ['confirmPassword'],
});

exports.changePasswordSchema = z.object({
  currentPassword : z.string().min(1),
  newPassword     : passwordSchema,
  confirmPassword : z.string(),
}).refine(d => d.newPassword === d.confirmPassword, {
  message: 'Passwords do not match',
  path:    ['confirmPassword'],
});

exports.verifyEmailSchema = z.object({
  token: z.string().min(1, 'Verification token is required'),
});
