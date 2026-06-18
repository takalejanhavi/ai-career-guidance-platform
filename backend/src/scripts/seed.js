'use strict';

/**
 * Development seed script — populates the DB with demo users.
 * NEVER run against production.
 *
 * Usage: node src/scripts/seed.js
 */

require('../config/env');
const mongoose     = require('mongoose');
const env          = require('../config/env');
const User         = require('../modules/users/user.model');
const Psychologist = require('../modules/psychologist/psychologist.model');

if (env.NODE_ENV === 'production') {
  console.error('❌  Seed script must not run in production');
  process.exit(1);
}

const SEED_USERS = [
  {
    firstName: 'Admin',      lastName: 'User',    email: 'admin@demo.com',
    passwordHash: 'Admin@1234!', role: 'admin',   isEmailVerified: true,
  },
  {
    firstName: 'Dr. Sarah',  lastName: 'Mitchell', email: 'psychologist@demo.com',
    passwordHash: 'Psych@1234!', role: 'psychologist', isEmailVerified: true,
  },
  {
    firstName: 'Alex',       lastName: 'Johnson',  email: 'student@demo.com',
    passwordHash: 'Student@1234!', role: 'student', isEmailVerified: true,
  },
  {
    firstName: 'Jamie',      lastName: 'Rivera',   email: 'student2@demo.com',
    passwordHash: 'Student@1234!', role: 'student', isEmailVerified: true,
  },
];

async function seed() {
  await mongoose.connect(env.MONGODB_URI);
  console.log('Connected. Seeding…\n');

  // Clear existing demo users
  await User.deleteMany({ email: { $in: SEED_USERS.map(u => u.email) } });

  for (const data of SEED_USERS) {
    const user = await User.create(data);
    console.log(`✓  Created ${user.role}: ${user.email}`);

    // Auto-create psychologist profile
    if (user.role === 'psychologist') {
      await Psychologist.create({
        userId: user._id,
        title:  'Dr.',
        specializations: ['Career Counseling', 'Educational Psychology'],
        yearsOfExperience: 8,
        languages: ['en'],
        isVerifiedProfessional: true,
        verificationStatus: 'approved',
        isAcceptingStudents: true,
      });
      console.log(`   └─ Psychologist profile created`);
    }
  }

  console.log('\nSeed complete.');
  await mongoose.disconnect();
}

seed().catch(err => {
  console.error('Seed failed:', err.message);
  process.exit(1);
});
