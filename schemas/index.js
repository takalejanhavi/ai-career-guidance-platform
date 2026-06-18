'use strict';

/**
 * Database bootstrap
 * ─────────────────
 * Imports and registers all Mongoose models.
 * Call `connectDB()` once at application startup.
 * Import individual models from their own files for tree-shaking,
 * or destructure from this index for convenience.
 *
 * Usage:
 *   const { connectDB, User, Report } = require('./models');
 *   await connectDB();
 */

const mongoose = require('mongoose');

// ─── Model registration (import order matters for circular refs) ──────────────
const User          = require('./User.model');
const Assessment    = require('./Assessment.model');
const Report        = require('./Report.model');
const Permission    = require('./Permission.model');
const Psychologist  = require('./Psychologist.model');
const AuditLog      = require('./AuditLog.model');
const Notification  = require('./Notification.model');

// ─── Connection helper ────────────────────────────────────────────────────────

const RETRY_LIMIT = 5;
const RETRY_DELAY = 3000; // ms

/**
 * Connect to MongoDB Atlas with retry logic.
 * Reads MONGODB_URI from environment.
 */
async function connectDB(retries = 0) {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI environment variable is not set');

  const options = {
    // Connection pool
    maxPoolSize          : 20,
    minPoolSize          : 5,
    maxIdleTimeMS        : 30000,
    // Timeouts
    serverSelectionTimeoutMS: 5000,
    socketTimeoutMS         : 45000,
    connectTimeoutMS        : 10000,
    // Heartbeat
    heartbeatFrequencyMS : 10000,
    // Write concern
    w                    : 'majority',
    // Read preference
    readPreference       : 'primaryPreferred',
    // Auto-index (disable in production for safety, manage indexes explicitly)
    autoIndex            : process.env.NODE_ENV !== 'production',
    // Compression
    compressors          : ['zlib'],
  };

  try {
    await mongoose.connect(uri, options);
    console.log(`[MongoDB] Connected — ${mongoose.connection.host}`);
    registerConnectionEvents();
  } catch (err) {
    if (retries < RETRY_LIMIT) {
      console.warn(`[MongoDB] Connection failed (attempt ${retries + 1}/${RETRY_LIMIT}). Retrying in ${RETRY_DELAY}ms…`);
      await new Promise(r => setTimeout(r, RETRY_DELAY));
      return connectDB(retries + 1);
    }
    console.error('[MongoDB] Could not connect after maximum retries', err);
    process.exit(1);
  }
}

function registerConnectionEvents() {
  const conn = mongoose.connection;
  conn.on('disconnected', () => console.warn('[MongoDB] Disconnected'));
  conn.on('reconnected',  () => console.info('[MongoDB] Reconnected'));
  conn.on('error',        (err) => console.error('[MongoDB] Connection error', err));
  // Graceful shutdown
  process.on('SIGINT',  () => gracefulClose('SIGINT'));
  process.on('SIGTERM', () => gracefulClose('SIGTERM'));
}

async function gracefulClose(signal) {
  await mongoose.connection.close();
  console.info(`[MongoDB] Connection closed on ${signal}`);
  process.exit(0);
}

// ─── Collection → Model map (for programmatic access) ─────────────────────────

const MODELS = {
  User,
  Assessment,
  Report,
  Permission,
  Psychologist,
  AuditLog,
  Notification,
};

/**
 * Programmatic index creation.
 * Run once after deployment to ensure all indexes are in place.
 * Not needed if autoIndex=true (non-production).
 */
async function ensureIndexes() {
  console.info('[MongoDB] Syncing indexes…');
  await Promise.all(
    Object.values(MODELS).map(M =>
      M.syncIndexes().then(() => console.info(`  ✓ ${M.modelName}`))
    )
  );
  console.info('[MongoDB] All indexes synced');
}

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = {
  connectDB,
  ensureIndexes,
  mongoose,
  ...MODELS,
};
