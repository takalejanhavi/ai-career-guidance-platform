'use strict';

const { authorize, selfOrAdmin, ownerOrAdmin, psychologistOrAdmin } = require('../../src/middleware/rbac.middleware');
const { validate, objectIdSchema, paginationSchema } = require('../../src/middleware/validate');
const AppError = require('../../src/utils/AppError');

// ─── Helpers ──────────────────────────────────────────────────────────────────

const mockNext = jest.fn();
const res      = {};
const makeReq  = (role, id = 'user-1') => ({ user: { _id: id, role } });

beforeEach(() => mockNext.mockClear());

// ─── authorize ────────────────────────────────────────────────────────────────

describe('authorize middleware', () => {
  test('passes when role matches', () => {
    const req = makeReq('admin');
    authorize('admin')(req, res, mockNext);
    expect(mockNext).toHaveBeenCalledWith(); // no args = next()
  });

  test('passes when role is one of the allowed', () => {
    const req = makeReq('psychologist');
    authorize('admin', 'psychologist')(req, res, mockNext);
    expect(mockNext).toHaveBeenCalledWith();
  });

  test('blocks wrong role with 403', () => {
    const req = makeReq('student');
    authorize('admin')(req, res, mockNext);
    const err = mockNext.mock.calls[0][0];
    expect(err).toBeInstanceOf(AppError);
    expect(err.statusCode).toBe(403);
  });

  test('blocks when no user attached', () => {
    authorize('admin')({}, res, mockNext);
    const err = mockNext.mock.calls[0][0];
    expect(err.statusCode).toBe(401);
  });
});

// ─── selfOrAdmin ──────────────────────────────────────────────────────────────

describe('selfOrAdmin middleware', () => {
  test('allows admin to access any userId param', () => {
    const req = { user: { _id: 'admin-id', role: 'admin' }, params: { id: 'other-user' } };
    selfOrAdmin(req, res, mockNext);
    expect(mockNext).toHaveBeenCalledWith();
  });

  test('allows user to access own id', () => {
    const req = { user: { _id: 'user-1', role: 'student' }, params: { id: 'user-1' } };
    selfOrAdmin(req, res, mockNext);
    expect(mockNext).toHaveBeenCalledWith();
  });

  test('blocks student from accessing another users id', () => {
    const req = { user: { _id: 'user-1', role: 'student' }, params: { id: 'user-2' } };
    selfOrAdmin(req, res, mockNext);
    const err = mockNext.mock.calls[0][0];
    expect(err.statusCode).toBe(403);
  });
});

// ─── ownerOrAdmin ─────────────────────────────────────────────────────────────

describe('ownerOrAdmin middleware', () => {
  test('admin always passes', () => {
    const req = { user: { _id: 'admin', role: 'admin' }, resource: { userId: 'owner' } };
    ownerOrAdmin(r => r.resource.userId)(req, res, mockNext);
    expect(mockNext).toHaveBeenCalledWith();
  });

  test('owner passes', () => {
    const req = { user: { _id: 'owner-1', role: 'student' }, resource: { userId: 'owner-1' } };
    ownerOrAdmin(r => r.resource.userId)(req, res, mockNext);
    expect(mockNext).toHaveBeenCalledWith();
  });

  test('non-owner blocked', () => {
    const req = { user: { _id: 'other', role: 'student' }, resource: { userId: 'owner-1' } };
    ownerOrAdmin(r => r.resource.userId)(req, res, mockNext);
    expect(mockNext.mock.calls[0][0].statusCode).toBe(403);
  });
});

// ─── psychologistOrAdmin ──────────────────────────────────────────────────────

describe('psychologistOrAdmin middleware', () => {
  test.each(['psychologist', 'admin'])('%s passes', (role) => {
    psychologistOrAdmin(makeReq(role), res, mockNext);
    expect(mockNext).toHaveBeenCalledWith();
  });

  test('student is blocked', () => {
    psychologistOrAdmin(makeReq('student'), res, mockNext);
    expect(mockNext.mock.calls[0][0].statusCode).toBe(403);
  });
});

// ─── validate middleware ──────────────────────────────────────────────────────

const { z } = require('zod');

describe('validate middleware', () => {
  test('passes valid body and mutates req.body with parsed values', () => {
    const schema = z.object({ name: z.string(), age: z.coerce.number() });
    const req    = { body: { name: 'Alice', age: '25' } };
    validate(schema)(req, res, mockNext);
    expect(mockNext).toHaveBeenCalledWith();
    expect(req.body.age).toBe(25); // coerced to number
  });

  test('calls next with 422 AppError on invalid body', () => {
    const schema = z.object({ email: z.string().email() });
    const req    = { body: { email: 'not-an-email' } };
    validate(schema)(req, res, mockNext);
    const err = mockNext.mock.calls[0][0];
    expect(err).toBeInstanceOf(AppError);
    expect(err.statusCode).toBe(422);
    expect(Array.isArray(err.meta)).toBe(true);
    expect(err.meta[0].field).toBe('email');
  });

  test('validates query params with target param', () => {
    const schema = z.object({ page: z.coerce.number() });
    const req    = { query: { page: '3' } };
    validate(schema, 'query')(req, res, mockNext);
    expect(req.query.page).toBe(3);
  });

  test('paginationSchema defaults page=1, limit=20', () => {
    const req = { query: {} };
    validate(paginationSchema, 'query')(req, res, mockNext);
    expect(req.query.page).toBe(1);
    expect(req.query.limit).toBe(20);
  });

  test('objectIdSchema rejects non-ObjectId strings', () => {
    const schema = z.object({ id: objectIdSchema });
    const req    = { params: { id: 'not-an-id' } };
    validate(schema, 'params')(req, res, mockNext);
    const err = mockNext.mock.calls[0][0];
    expect(err.statusCode).toBe(422);
  });
});
