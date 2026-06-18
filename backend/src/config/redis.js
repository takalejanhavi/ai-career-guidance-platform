'use strict';

const IORedis = require('ioredis');
const Bull    = require('bull');
const env     = require('./env');
const logger  = require('./logger');

// ─── Redis client ─────────────────────────────────────────────────────────────

const redis = new IORedis(env.REDIS_URL, {
  maxRetriesPerRequest: null,
  enableReadyCheck:     false,
  lazyConnect:          false,
  retryStrategy(times) {
    const delay = Math.min(times * 50, 2000);
    logger.warn(`Redis retry attempt ${times}, waiting ${delay}ms`);
    return delay;
  },
});

redis.on('connect',      () => logger.info('Redis connected'));
redis.on('error',        err => logger.error('Redis error', { error: err.message }));
redis.on('reconnecting', () => logger.warn('Redis reconnecting…'));

// ─── Queue factory ────────────────────────────────────────────────────────────

const QUEUE_DEFAULTS = {
  defaultJobOptions: {
    attempts:      3,
    backoff:       { type: 'exponential', delay: 2000 },
    removeOnComplete: 100,
    removeOnFail:     50,
  },
  settings: { stalledInterval: 30000 },
};

function createQueue(name) {
  const q = new Bull(name, {
    redis: env.REDIS_URL,
    ...QUEUE_DEFAULTS,
  });
  q.on('error',   err => logger.error(`Queue [${name}] error`, { error: err.message }));
  q.on('stalled', job => logger.warn(`Queue [${name}] job stalled`, { jobId: job.id }));
  return q;
}

// Named queues
const Queues = {
  PDF:         createQueue('pdf-generation'),
  BLOCKCHAIN:  createQueue('blockchain-anchor'),
  EMAIL:       createQueue('email-dispatch'),
  NOTIFICATION: createQueue('notification'),
};

module.exports = { redis, Queues };
