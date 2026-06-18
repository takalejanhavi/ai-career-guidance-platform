'use strict';

const errorHandler = require('../../src/middleware/errorHandler');
const AppError     = require('../../src/utils/AppError');

const mockReq = { originalUrl: '/test', method: 'GET', user: null, id: 'req-1', headers: {} };
const mockRes = () => {
  const r = {};
  r.status = jest.fn().mockReturnValue(r);
  r.json   = jest.fn().mockReturnValue(r);
  return r;
};

describe('errorHandler middleware', () => {
  test('serialises AppError correctly', () => {
    const res  = mockRes();
    const err  = AppError.notFound('Assessment');
    errorHandler(err, mockReq, res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(404);
    const body = res.json.mock.calls[0][0];
    expect(body.status).toBe('fail');
    expect(body.code).toBe('NOT_FOUND');
    expect(body.message).toContain('Assessment');
  });

  test('handles Mongoose CastError (malformed ObjectId)', () => {
    const res = mockRes();
    const err = Object.assign(new Error('Cast error'), {
      name: 'CastError', kind: 'ObjectId', path: '_id', value: 'bad',
    });
    err.name = 'CastError'; // mongoose specific
    // Simulate a mongoose CastError by checking the normalizer
    const mongoose = require('mongoose');
    const castErr  = new mongoose.Error.CastError('ObjectId', 'bad', '_id');
    errorHandler(castErr, mockReq, res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(400);
  });

  test('handles duplicate key error (code 11000)', () => {
    const res = mockRes();
    const err = Object.assign(new Error('Duplicate key'), {
      code: 11000, keyValue: { email: 'test@test.com' },
    });
    errorHandler(err, mockReq, res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(409);
    const body = res.json.mock.calls[0][0];
    expect(body.code).toBe('DUPLICATE_VALUE');
  });

  test('handles JWT invalid token', () => {
    const res = mockRes();
    const jwt = require('jsonwebtoken');
    const err = new jwt.JsonWebTokenError('invalid signature');
    errorHandler(err, mockReq, res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(401);
  });

  test('handles JWT expired token', () => {
    const res = mockRes();
    const jwt = require('jsonwebtoken');
    const err = new jwt.TokenExpiredError('jwt expired', new Date());
    errorHandler(err, mockReq, res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(401);
  });

  test('returns 500 for unknown errors', () => {
    const res = mockRes();
    const err = new Error('Some unexpected bug');
    process.env.NODE_ENV = 'test';
    errorHandler(err, mockReq, res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(500);
  });

  test('validation AppError includes errors array in body', () => {
    const res  = mockRes();
    const meta = [{ field: 'email', message: 'Invalid' }];
    const err  = AppError.unprocessable('Validation failed', meta);
    errorHandler(err, mockReq, res, jest.fn());
    const body = res.json.mock.calls[0][0];
    expect(body.errors).toEqual(meta);
  });
});
