'use strict';

/**
 * Auth integration tests.
 *
 * These tests use supertest against the Express app directly,
 * with all Mongoose calls mocked via jest.mock so no real DB is needed.
 *
 * For full E2E tests against a real DB, use the /tests/e2e directory
 * and a mongodb-memory-server instance.
 */

const request = require('supertest');

// ── Setup env before any module import ──────────────────────────────────────
process.env.NODE_ENV         = 'test';
process.env.FRONTEND_URL     = 'http://localhost:5173';
process.env.MONGODB_URI      = 'mongodb://localhost/test';
process.env.AI_SERVICE_URL   = 'http://localhost:5050';
process.env.AI_SERVICE_SECRET = 'test_secret_12345678';
process.env.SMTP_HOST = 'localhost';
process.env.SMTP_USER = 'test';
process.env.SMTP_PASS = 'test';
process.env.EMAIL_FROM = 'test@test.com';
process.env.S3_BUCKET     = 'test-bucket';
process.env.S3_ACCESS_KEY = 'test-key';
process.env.S3_SECRET_KEY = 'test-secret';

const crypto = require('crypto');
const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding:  { type: 'spki',  format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});
process.env.JWT_PRIVATE_KEY      = privateKey;
process.env.JWT_PUBLIC_KEY       = publicKey;
process.env.JWT_ACCESS_EXPIRES   = '15m';
process.env.JWT_REFRESH_EXPIRES  = '7d';

// ── Mock native module that can't build in CI/sandbox ────────────────────────
jest.mock('bcrypt', () => ({
  hash   : jest.fn().mockResolvedValue('$hashed$'),
  compare: jest.fn().mockResolvedValue(true),
}));

// ── Mock mongoose and redis ──────────────────────────────────────────────────
jest.mock('mongoose', () => ({
  connect: jest.fn().mockResolvedValue({}),
  disconnect: jest.fn().mockResolvedValue({}),
  connection: { host: 'test', on: jest.fn(), close: jest.fn() },
  Schema: jest.requireActual('mongoose').Schema,
  model: jest.fn().mockReturnValue({}),
  Error: jest.requireActual('mongoose').Error,
}));

jest.mock('ioredis', () => {
  const E = require('events');
  class MockRedis extends E { on() { return this; } }
  return MockRedis;
});
jest.mock('bull', () => {
  return jest.fn().mockImplementation(() => ({
    add: jest.fn().mockResolvedValue({}),
    process: jest.fn(),
    on: jest.fn().mockReturnThis(),
  }));
});

// ── Mock auth service ────────────────────────────────────────────────────────
jest.mock('../../src/modules/auth/auth.service', () => ({
  register: jest.fn(),
  login:    jest.fn(),
  refresh:  jest.fn(),
  logout:   jest.fn(),
  forgotPassword: jest.fn(),
  resetPassword:  jest.fn(),
  verifyEmail:    jest.fn(),
  changePassword: jest.fn(),
}));

jest.mock('../../src/middleware/auth.middleware', () => ({
  authenticate:         jest.fn((req, res, next) => {
    req.user = { _id: 'user-1', role: 'student', email: 'test@test.com', isActive: true, isSuspended: false };
    next();
  }),
  authenticateOptional: jest.fn((req, res, next) => next()),
}));

const app         = require('../../src/app');
const authService = require('../../src/modules/auth/auth.service');

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('POST /api/v1/auth/register', () => {
  const validBody = {
    firstName: 'Alice', lastName: 'Smith',
    email: 'alice@test.com', password: 'Test@1234!', role: 'student',
  };

  test('201 on valid registration', async () => {
    authService.register.mockResolvedValueOnce({
      user: { _id: 'u1', email: 'alice@test.com', role: 'student', firstName: 'Alice', lastName: 'Smith' },
    });
    const res = await request(app).post('/api/v1/auth/register').send(validBody);
    expect(res.status).toBe(201);
    expect(res.body.status).toBe('success');
  });

  test('422 on missing required fields', async () => {
    const res = await request(app).post('/api/v1/auth/register').send({ email: 'x@x.com' });
    expect(res.status).toBe(422);
    expect(Array.isArray(res.body.errors)).toBe(true);
  });

  test('422 on weak password', async () => {
    const res = await request(app).post('/api/v1/auth/register')
      .send({ ...validBody, password: 'weak' });
    expect(res.status).toBe(422);
  });

  test('422 on invalid role', async () => {
    const res = await request(app).post('/api/v1/auth/register')
      .send({ ...validBody, role: 'superuser' });
    expect(res.status).toBe(422);
  });

  test('409 when service throws conflict', async () => {
    const AppError = require('../../src/utils/AppError');
    authService.register.mockRejectedValueOnce(AppError.conflict('Email in use', 'EMAIL_IN_USE'));
    const res = await request(app).post('/api/v1/auth/register').send(validBody);
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('EMAIL_IN_USE');
  });
});

describe('POST /api/v1/auth/login', () => {
  test('200 with accessToken on valid credentials', async () => {
    authService.login.mockResolvedValueOnce({
      user: { _id: 'u1', role: 'student' },
      accessToken: 'at-token',
      refreshToken: 'rt-token',
    });
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'alice@test.com', password: 'Test@1234!' });
    expect(res.status).toBe(200);
    expect(res.body.data.accessToken).toBe('at-token');
    // Cookie should be set
    expect(res.headers['set-cookie']).toBeDefined();
  });

  test('422 on missing password', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'alice@test.com' });
    expect(res.status).toBe(422);
  });

  test('401 when service throws unauthorized', async () => {
    const AppError = require('../../src/utils/AppError');
    authService.login.mockRejectedValueOnce(AppError.unauthorized('Bad credentials'));
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'x@x.com', password: 'Test@1234!' });
    expect(res.status).toBe(401);
  });
});

describe('POST /api/v1/auth/forgot-password', () => {
  test('200 regardless of whether email exists', async () => {
    authService.forgotPassword.mockResolvedValueOnce(undefined);
    const res = await request(app)
      .post('/api/v1/auth/forgot-password')
      .send({ email: 'notexist@test.com' });
    expect(res.status).toBe(200);
    expect(res.body.message).toContain('If that email');
  });
});

describe('GET /api/v1/auth/me', () => {
  test('200 returns current user', async () => {
    const res = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', 'Bearer fake-token');
    expect(res.status).toBe(200);
    expect(res.body.data.user.role).toBe('student');
  });
});

describe('GET /healthz', () => {
  test('returns 200 ok', async () => {
    const res = await request(app).get('/healthz');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });
});

describe('404 handler', () => {
  test('unknown route returns 404', async () => {
    const res = await request(app).get('/api/v1/nonexistent-route');
    expect(res.status).toBe(404);
    expect(res.body.code).toBe('NOT_FOUND');
  });
});
