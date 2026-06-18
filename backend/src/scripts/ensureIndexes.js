'use strict';

/**
 * Run once post-deployment to sync all MongoDB indexes.
 * Safe to run multiple times — idempotent.
 *
 * Usage: node src/scripts/ensureIndexes.js
 */

require('../config/env');
const mongoose = require('mongoose');
const env      = require('../config/env');

// Register all models
const models = [
  require('../modules/users/user.model'),
  require('../modules/assessment/assessment.model'),
  require('../modules/reports/report.model'),
  require('../modules/permissions/permission.model'),
  require('../modules/psychologist/psychologist.model'),
  require('../modules/audit/auditlog.model'),
  require('../modules/notifications/notification.model'),
];

async function run() {
  await mongoose.connect(env.MONGODB_URI, { autoIndex: true });
  console.log('Connected to MongoDB');

  for (const M of models) {
    try {
      await M.syncIndexes();
      console.log(`✓  ${M.modelName} indexes synced`);
    } catch (err) {
      console.error(`✗  ${M.modelName}:`, err.message);
    }
  }

  await mongoose.disconnect();
  console.log('Done');
}

run().catch(err => {
  console.error('Index sync failed:', err.message);
  process.exit(1);
});
