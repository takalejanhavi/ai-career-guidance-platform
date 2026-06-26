'use strict';

const IORedis = require('ioredis');
const Bull    = require('bull');
const env     = require('./env');
const logger  = require('./logger');

// ─── Shared IORedis options ───────────────────────────────────────────────────

const IOREDIS_OPTS = {
  maxRetriesPerRequest: null,
  enableReadyCheck:     false,
  lazyConnect:          false,
  retryStrategy(times) {
    const delay = Math.min(times * 50, 2000);
    logger.warn(`Redis retry attempt ${times}, waiting ${delay}ms`);
    return delay;
  },
};

// ─── Shared connections ───────────────────────────────────────────────────────
//
// Bull needs 3 connection types per queue: client (commands), subscriber
// (pub/sub events), and bclient (blocking BLPOP for job polling).
//
// The old code passed `redis: env.REDIS_URL` to Bull, causing it to open
// 3 brand-new IORedis connections per queue — 4 queues × 3 = 12 connections,
// plus the standalone `redis` singleton = 13 total per process.
//
// With `createClient`, client and subscriber are shared across all queues.
// Only bclient must be dedicated (a blocking connection cannot handle
// interleaved commands from multiple queues). Result: 2 + 4 = 6 connections.

const client     = new IORedis(env.REDIS_URL, IOREDIS_OPTS);
const subscriber = new IORedis(env.REDIS_URL, IOREDIS_OPTS);

client.on('connect',      () => logger.info('Redis connected'));
client.on('error',        err => logger.error('Redis error', { error: err.message }));
client.on('reconnecting', () => logger.warn('Redis reconnecting…'));

// ─── Queue defaults ───────────────────────────────────────────────────────────

const QUEUE_DEFAULTS = {
  defaultJobOptions: {
    attempts:         3,
    backoff:          { type: 'exponential', delay: 2000 },
    removeOnComplete: 100,
    removeOnFail:     50,
  },
  settings: { stalledInterval: 30000 },
};

// ─── Queue factory ────────────────────────────────────────────────────────────

function createQueue(name) {
  const q = new Bull(name, {
    createClient(type) {
      switch (type) {
        case 'client':     return client;
        case 'subscriber': return subscriber;
        default:
          // 'bclient' — dedicated per queue; BLPOP blocks the entire connection
          // until a job arrives, so it cannot be shared across queues.
          return new IORedis(env.REDIS_URL, IOREDIS_OPTS);
      }
    },
    ...QUEUE_DEFAULTS,
  });
  q.on('error',   err => logger.error(`Queue [${name}] error`, { error: err.message }));
  q.on('stalled', job => logger.warn(`Queue [${name}] job stalled`, { jobId: job?.id }));
  return q;
}

// ─── Named queues ─────────────────────────────────────────────────────────────

const Queues = {
  PDF:          createQueue('pdf-generation'),
  BLOCKCHAIN:   createQueue('blockchain-anchor'),
  EMAIL:        createQueue('email-dispatch'),
  NOTIFICATION: createQueue('notification'),
};

// ─── Graceful shutdown ────────────────────────────────────────────────────────

async function closeRedis() {
  await Promise.all([
    ...Object.values(Queues).map(q => q.close()),
    client.quit(),
    subscriber.quit(),
  ]);
  logger.info('Redis connections closed');
}

// ─── Exports ──────────────────────────────────────────────────────────────────
// `redis` is the shared command client — exported for any direct Redis usage.

module.exports = { redis: client, Queues, closeRedis };
