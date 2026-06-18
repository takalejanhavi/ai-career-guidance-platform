'use strict';

// Load env first
require('./config/env');

const app              = require('./app');
const { connectDB, disconnectDB } = require('./config/database');
const logger           = require('./config/logger');
const env              = require('./config/env');

// Catch unhandled promise rejections
process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled rejection', { reason: reason?.message || reason });
  gracefulShutdown(1);
});

process.on('uncaughtException', (err) => {
  logger.error('Uncaught exception', { error: err.message, stack: err.stack });
  gracefulShutdown(1);
});

let server;

async function start() {
  // Connect DB
  await connectDB();

  // Register queue workers (after DB is ready)
  if (env.NODE_ENV !== 'test') {
    require('./jobs/workers');
  }

  server = app.listen(env.PORT, () => {
    logger.info(`${env.APP_NAME} running on port ${env.PORT} [${env.NODE_ENV}]`);
  });

  server.keepAliveTimeout    = 65000;
  server.headersTimeout      = 66000;
}

async function gracefulShutdown(code = 0) {
  logger.info('Graceful shutdown initiated…');
  if (server) {
    server.close(async () => {
      await disconnectDB();
      logger.info('Server closed');
      process.exit(code);
    });
    // Force close after 10s
    setTimeout(() => process.exit(code), 10000).unref();
  } else {
    process.exit(code);
  }
}

process.on('SIGTERM', () => gracefulShutdown(0));
process.on('SIGINT',  () => gracefulShutdown(0));

start().catch(err => {
  logger.error('Startup failed', { error: err.message });
  process.exit(1);
});
