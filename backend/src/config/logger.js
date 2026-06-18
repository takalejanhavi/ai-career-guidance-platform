'use strict';

const { createLogger, format, transports } = require('winston');
const DailyRotateFile = require('winston-daily-rotate-file');
const path = require('path');

// NODE_ENV safe read (env.js not yet loaded when logger bootstraps)
const NODE_ENV = process.env.NODE_ENV || 'development';
const LOG_LEVEL = process.env.LOG_LEVEL || 'info';
const LOG_DIR   = process.env.LOG_DIR   || 'logs';

const { combine, timestamp, errors, json, colorize, printf, splat } = format;

// ─── Formats ──────────────────────────────────────────────────────────────────

const jsonFormat = combine(
  timestamp(),
  errors({ stack: true }),
  splat(),
  json()
);

const consoleFormat = combine(
  colorize({ all: true }),
  timestamp({ format: 'HH:mm:ss' }),
  errors({ stack: true }),
  printf(({ level, message, timestamp: ts, stack, ...meta }) => {
    let out = `${ts} [${level}] ${message}`;
    if (stack) out += `\n${stack}`;
    if (Object.keys(meta).length) out += `\n${JSON.stringify(meta, null, 2)}`;
    return out;
  })
);

// ─── Transports ───────────────────────────────────────────────────────────────

const fileTransports = NODE_ENV !== 'test'
  ? [
      new DailyRotateFile({
        filename:     path.join(LOG_DIR, 'error-%DATE%.log'),
        datePattern:  'YYYY-MM-DD',
        level:        'error',
        maxFiles:     '30d',
        maxSize:      '20m',
        format:       jsonFormat,
        zippedArchive: true,
      }),
      new DailyRotateFile({
        filename:    path.join(LOG_DIR, 'combined-%DATE%.log'),
        datePattern: 'YYYY-MM-DD',
        maxFiles:    '14d',
        maxSize:     '20m',
        format:      jsonFormat,
        zippedArchive: true,
      }),
    ]
  : [];

const logger = createLogger({
  level:       LOG_LEVEL,
  exitOnError: false,
  transports:  [
    new transports.Console({
      silent: NODE_ENV === 'test',
      format: NODE_ENV === 'production' ? jsonFormat : consoleFormat,
    }),
    ...fileTransports,
  ],
});

// Morgan HTTP stream adapter
logger.stream = {
  write: (message) => logger.http(message.trim()),
};

module.exports = logger;
