'use strict';

const { z } = require('zod');

exports.updateProfileSchema = z.object({
  firstName : z.string().min(1).max(100).trim().optional(),
  lastName  : z.string().min(1).max(100).trim().optional(),
  phone     : z.string().max(20).optional().nullable(),
  profile   : z.object({
    dateOfBirth  : z.string().datetime().optional().nullable(),
    gender       : z.enum(['male','female','non-binary','prefer_not_to_say']).optional().nullable(),
    country      : z.string().max(100).optional().nullable(),
    city         : z.string().max(100).optional().nullable(),
    institution  : z.string().max(200).optional().nullable(),
    gradeLevel   : z.string().max(50).optional().nullable(),
    bio          : z.string().max(1000).optional().nullable(),
    avatarUrl    : z.string().url().max(500).optional().nullable(),
  }).optional(),
});

exports.changeRoleSchema = z.object({
  role: z.enum(['student', 'psychologist', 'admin']),
});

exports.suspendSchema = z.object({
  reason: z.string().min(1).max(500),
});

exports.listUsersQuerySchema = z.object({
  page     : z.coerce.number().int().min(1).default(1),
  limit    : z.coerce.number().int().min(1).max(100).default(20),
  role     : z.enum(['student','psychologist','admin']).optional(),
  search   : z.string().max(100).optional(),
  isActive : z.coerce.boolean().optional(),
});
