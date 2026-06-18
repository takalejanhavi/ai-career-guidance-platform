'use strict';

const mongoose = require('mongoose');
const env      = require('./env');
const logger   = require('./logger');

const RETRY_LIMIT = 5;
const RETRY_DELAY = 3000;

const OPTIONS = {
  maxPoolSize:               20,
  minPoolSize:               5,
  maxIdleTimeMS:             30000,
  serverSelectionTimeoutMS:  5000,
  socketTimeoutMS:           45000,
  connectTimeoutMS:          10000,
  heartbeatFrequencyMS:      10000,
  w:                         'majority',
  readPreference:            'primaryPreferred',
  autoIndex:                 env.NODE_ENV !== 'production',
  compressors:               ['zlib'],
};

async function connectDB(attempt = 1) {
  try {
    await mongoose.connect(env.MONGODB_URI, OPTIONS);
    logger.info(`MongoDB connected — ${mongoose.connection.host}`);
    attachEvents();
  } catch (err) {
    if (attempt <= RETRY_LIMIT) {
      logger.warn(`MongoDB connection failed (attempt ${attempt}/${RETRY_LIMIT}). Retrying in ${RETRY_DELAY}ms…`);
      await new Promise(r => setTimeout(r, RETRY_DELAY));
      return connectDB(attempt + 1);
    }
    logger.error('MongoDB: max retries exceeded', { error: err.message });
    process.exit(1);
  }
}

function attachEvents() {
  mongoose.connection.on('disconnected', () => logger.warn('MongoDB disconnected'));
  mongoose.connection.on('reconnected',  () => logger.info('MongoDB reconnected'));
  mongoose.connection.on('error',        err => logger.error('MongoDB error', { error: err.message }));
}

async function disconnectDB() {
  await mongoose.connection.close();
  logger.info('MongoDB connection closed');
}

module.exports = { connectDB, disconnectDB };
