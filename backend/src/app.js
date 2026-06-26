'use strict';

const express         = require('express');
const helmet          = require('helmet');
const cors            = require('cors');
const compression     = require('compression');
const morgan          = require('morgan');
const cookieParser    = require('cookie-parser');
const mongoSanitize   = require('express-mongo-sanitize');
const hpp             = require('hpp');

const env            = require('./config/env');
const logger         = require('./config/logger');
const requestId      = require('./middleware/requestId');
const { apiLimiter } = require('./middleware/rateLimiter');
const errorHandler   = require('./middleware/errorHandler');
const AppError       = require('./utils/AppError');

// Route modules
const authRoutes            = require('./modules/auth/auth.routes');
const userRoutes            = require('./modules/users/user.routes');
const assessmentRoutes      = require('./modules/assessment/assessment.routes');
const reportRoutes          = require('./modules/reports/report.routes');
const permissionRoutes      = require('./modules/permissions/permission.routes');
const dashboardRoutes       = require('./modules/dashboard/dashboard.routes');
const notificationRoutes    = require('./modules/notifications/notification.routes');
const psychologistRoutes    = require('./modules/psychologist/psychologist.routes');

const app = express();
// Render is behind a reverse proxy
app.set('trust proxy', 1);
// ─── Security headers ─────────────────────────────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc : ["'self'"],
      styleSrc   : ["'self'", "'unsafe-inline'"],
      imgSrc     : ["'self'", 'data:', 'https:'],
      scriptSrc  : ["'self'"],
    },
  },
  crossOriginEmbedderPolicy: false,
}));

// ─── CORS ─────────────────────────────────────────────────────────────────────
app.use(cors({
  origin      : env.FRONTEND_URL,
  credentials : true,
  methods     : ['GET','POST','PATCH','PUT','DELETE','OPTIONS'],
  allowedHeaders: ['Content-Type','Authorization','X-Request-ID'],
}));

// ─── Request utilities ────────────────────────────────────────────────────────
app.use(requestId);
app.use(compression());
app.use(cookieParser());
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true, limit: '10kb' }));

// ─── Sanitization ─────────────────────────────────────────────────────────────
app.use(mongoSanitize());  // prevent NoSQL injection
app.use(hpp());             // prevent HTTP parameter pollution

// ─── Logging ──────────────────────────────────────────────────────────────────
if (env.NODE_ENV !== 'test') {
  app.use(morgan('combined', { stream: logger.stream }));
}

// ─── Health / readiness (no auth, no rate limit) ─────────────────────────────
app.get('/healthz', (req, res) => {
  res.json({ status: 'ok', env: env.NODE_ENV, ts: new Date().toISOString() });
});

app.get('/readyz', (req, res) => {
  const mongoose = require('mongoose');
  const dbState  = mongoose.connection.readyState; // 1 = connected
  if (dbState !== 1) {
    return res.status(503).json({ status: 'unavailable', db: 'disconnected' });
  }
  res.json({ status: 'ready', db: 'connected', ts: new Date().toISOString() });
});

// ─── API routes ───────────────────────────────────────────────────────────────
app.use('/api/v1', apiLimiter);
app.use('/api/v1/auth',           authRoutes);
app.use('/api/v1/users',          userRoutes);
app.use('/api/v1/assessments',    assessmentRoutes);
app.use('/api/v1/reports',        reportRoutes);
app.use('/api/v1/permissions',    permissionRoutes);
app.use('/api/v1/dashboard',      dashboardRoutes);
app.use('/api/v1/notifications',  notificationRoutes);
app.use('/api/v1/psychologists',  psychologistRoutes);

// ─── 404 handler ──────────────────────────────────────────────────────────────
app.all('*', (req, res, next) => {
  next(AppError.notFound(`Route ${req.method} ${req.originalUrl}`));
});

// ─── Global error handler ─────────────────────────────────────────────────────
app.use(errorHandler);

module.exports = app;
