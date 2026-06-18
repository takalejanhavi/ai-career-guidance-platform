'use strict';

require('dotenv').config();
const { z } = require('zod');

const envSchema = z.object({
  NODE_ENV:    z.enum(['development', 'test', 'production']).default('development'),
  PORT:        z.coerce.number().default(4000),
  APP_NAME:    z.string().default('Career Guidance API'),
  FRONTEND_URL: z.string().url(),

  MONGODB_URI: z.string().min(10),

  JWT_PRIVATE_KEY:     z.string().min(10),
  JWT_PUBLIC_KEY:      z.string().min(10),
  JWT_ACCESS_EXPIRES:  z.string().default('15m'),
  JWT_REFRESH_EXPIRES: z.string().default('7d'),

  REDIS_URL: z.string().default('redis://localhost:6379'),

  AI_SERVICE_URL:    z.string().url(),
  AI_SERVICE_SECRET: z.string().min(8),

  SMTP_HOST: z.string(),
  SMTP_PORT: z.coerce.number().default(465),
  SMTP_USER: z.string(),
  SMTP_PASS: z.string(),
  EMAIL_FROM: z.string(),

  S3_ENDPOINT:            z.string().url().optional(),
  S3_BUCKET:              z.string(),
  S3_REGION:              z.string().default('us-east-1'),
  S3_ACCESS_KEY:          z.string(),
  S3_SECRET_KEY:          z.string(),
  S3_SIGNED_URL_EXPIRES:  z.coerce.number().default(3600),

  BLOCKCHAIN_RPC_URL:     z.string().url().optional(),
  BLOCKCHAIN_PRIVATE_KEY: z.string().optional(),
  CONTRACT_ADDRESS:       z.string().optional(),
  BLOCKCHAIN_NETWORK:     z.string().default('polygon-mumbai'),

  RATE_LIMIT_WINDOW_MS: z.coerce.number().default(900000),
  RATE_LIMIT_MAX:       z.coerce.number().default(100),
  AUTH_RATE_LIMIT_MAX:  z.coerce.number().default(10),

  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'http', 'debug']).default('info'),
  LOG_DIR:   z.string().default('logs'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('❌  Invalid environment variables:\n');
  parsed.error.issues.forEach(i => console.error(`  ${i.path.join('.')}: ${i.message}`));
  process.exit(1);
}

module.exports = parsed.data;
