'use strict';

const AppError = require('../../src/utils/AppError');
const { success, created, paginated } = require('../../src/utils/apiResponse');

// ─── AppError ─────────────────────────────────────────────────────────────────

describe('AppError', () => {
  test('creates error with correct properties', () => {
    const err = new AppError('Not found', 404, 'NOT_FOUND');
    expect(err.message).toBe('Not found');
    expect(err.statusCode).toBe(404);
    expect(err.status).toBe('fail');
    expect(err.code).toBe('NOT_FOUND');
    expect(err.isOperational).toBe(true);
    expect(err instanceof Error).toBe(true);
  });

  test('status is "error" for 5xx codes', () => {
    const err = new AppError('Internal', 500);
    expect(err.status).toBe('error');
  });

  test('factory methods produce correct codes', () => {
    expect(AppError.unauthorized().statusCode).toBe(401);
    expect(AppError.forbidden().statusCode).toBe(403);
    expect(AppError.notFound('User').statusCode).toBe(404);
    expect(AppError.conflict('Dup', 'DUP').code).toBe('DUP');
    expect(AppError.unprocessable('Validation', []).statusCode).toBe(422);
    expect(AppError.tooManyRequests().statusCode).toBe(429);
    expect(AppError.internal().statusCode).toBe(500);
    expect(AppError.serviceUnavailable('Redis').statusCode).toBe(503);
  });

  test('notFound includes resource name in message', () => {
    const err = AppError.notFound('Assessment');
    expect(err.message).toContain('Assessment');
  });

  test('meta is attached for unprocessable', () => {
    const meta = [{ field: 'email', message: 'Invalid' }];
    const err  = AppError.unprocessable('Validation failed', meta);
    expect(err.meta).toEqual(meta);
  });
});

// ─── apiResponse ──────────────────────────────────────────────────────────────

describe('apiResponse helpers', () => {
  const mockRes = () => {
    const res = {};
    res.status  = jest.fn().mockReturnValue(res);
    res.json    = jest.fn().mockReturnValue(res);
    res.send    = jest.fn().mockReturnValue(res);
    return res;
  };

  test('success sends 200 with status:success envelope', () => {
    const res = mockRes();
    success(res, { user: { id: 1 } });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'success', data: { user: { id: 1 } } })
    );
  });

  test('created sends 201', () => {
    const res = mockRes();
    created(res, { id: 'abc' }, 'Created!');
    expect(res.status).toHaveBeenCalledWith(201);
    const body = res.json.mock.calls[0][0];
    expect(body.message).toBe('Created!');
  });

  test('paginated includes meta with totalPages', () => {
    const res = mockRes();
    paginated(res, [1, 2, 3], { page: 1, limit: 10, total: 45 });
    const body = res.json.mock.calls[0][0];
    expect(body.meta.totalPages).toBe(5);
    expect(body.meta.total).toBe(45);
  });
});
