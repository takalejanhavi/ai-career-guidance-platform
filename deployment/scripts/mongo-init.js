// deployment/scripts/mongo-init.js
// Runs on first MongoDB container start
// Creates indexes, users, and initial configuration

db = db.getSiblingDB('career_guidance');

// Create application user with restricted permissions
db.createUser({
  user: 'career_app',
  pwd:  'change_in_production',
  roles: [
    { role: 'readWrite', db: 'career_guidance' },
  ]
});

// Create collections with validation
db.createCollection('users', {
  validator: {
    $jsonSchema: {
      bsonType: 'object',
      required: ['email', 'role', 'firstName', 'lastName'],
      properties: {
        email:     { bsonType: 'string' },
        role:      { bsonType: 'string', enum: ['student', 'psychologist', 'admin'] },
        firstName: { bsonType: 'string' },
        lastName:  { bsonType: 'string' },
      }
    }
  }
});

db.createCollection('assessments');
db.createCollection('reports');
db.createCollection('permissions');
db.createCollection('notifications');
db.createCollection('auditlogs');
db.createCollection('psychologists');

// Core indexes (also created by Mongoose, but here for fresh deploys)
db.users.createIndex({ email: 1 }, { unique: true });
db.users.createIndex({ role: 1, isActive: 1 });
db.users.createIndex({ createdAt: -1 });

db.assessments.createIndex({ userId: 1, status: 1 });
db.assessments.createIndex({ userId: 1, createdAt: -1 });

db.reports.createIndex({ userId: 1, createdAt: -1 });
db.reports.createIndex({ assessmentId: 1 }, { unique: true, sparse: true });
db.reports.createIndex({ 'blockchain.status': 1 });

db.permissions.createIndex({ reportId: 1, grantedTo: 1 }, { unique: true });
db.permissions.createIndex({ grantedTo: 1, isRevoked: 1 });

db.notifications.createIndex({ userId: 1, isRead: 1, createdAt: -1 });
db.notifications.createIndex(
  { expiresAt: 1 },
  { expireAfterSeconds: 0, sparse: true }
);

db.auditlogs.createIndex({ actorId: 1, occurredAt: -1 });
db.auditlogs.createIndex({ action: 1, occurredAt: -1 });
db.auditlogs.createIndex(
  { occurredAt: 1 },
  { expireAfterSeconds: 63072000 }  // 2 year TTL
);

print('MongoDB initialization complete');
print('Collections created: ' + db.getCollectionNames().join(', '));
