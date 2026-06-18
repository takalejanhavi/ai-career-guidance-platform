'use strict';

/**
 * Psychologist Model
 * Extended professional profile for users with role=psychologist.
 * Always paired 1:1 with a User document.
 *
 * Relationships:
 *   - Psychologist (1) → User (1)       via Psychologist.userId  [1:1, required]
 *   - Psychologist (1) → User (N)       via Psychologist.assignedStudentIds
 *   - Psychologist (N) → Organization   via Psychologist.organizationId [future]
 *
 * Creation: when a User with role=psychologist is verified,
 *           a Psychologist document is auto-created via post-save hook on User.
 */

const mongoose = require('mongoose');
const { Schema, model } = mongoose;

// ─── Sub-schemas ──────────────────────────────────────────────────────────────

const CredentialSchema = new Schema(
  {
    type         : { type: String, required: true, maxlength: 100 },  // e.g. "Licensed Psychologist"
    issuingBody  : { type: String, required: true, maxlength: 200 },
    licenseNumber: { type: String, maxlength: 100, default: null },
    issuedAt     : { type: Date, default: null },
    expiresAt    : { type: Date, default: null },
    verified     : { type: Boolean, default: false },
    verifiedAt   : { type: Date, default: null },
    verifiedBy   : { type: Schema.Types.ObjectId, ref: 'User', default: null }, // admin who verified
    documentUrl  : { type: String, maxlength: 1000, select: false, default: null }, // upload
  },
  { _id: true }
);

const AvailabilitySlotSchema = new Schema(
  {
    dayOfWeek : { type: Number, required: true, min: 0, max: 6 },   // 0=Sunday
    startTime : { type: String, required: true, match: /^\d{2}:\d{2}$/ }, // "09:00"
    endTime   : { type: String, required: true, match: /^\d{2}:\d{2}$/ },
    timezone  : { type: String, required: true, maxlength: 100 },
  },
  { _id: false }
);

const StatisticsSchema = new Schema(
  {
    totalStudentsAssigned: { type: Number, default: 0, min: 0 },
    totalReportsReviewed : { type: Number, default: 0, min: 0 },
    totalAnnotations     : { type: Number, default: 0, min: 0 },
    avgReviewTimeHours   : { type: Number, default: null, min: 0 },
    lastActivityAt       : { type: Date, default: null },
  },
  { _id: false }
);

// ─── Main Schema ──────────────────────────────────────────────────────────────

const PsychologistSchema = new Schema(
  {
    // ── Core Reference ─────────────────────────────────────────────────────────
    userId: {
      type    : Schema.Types.ObjectId,
      ref     : 'User',
      required: [true, 'userId is required'],
      unique  : true,      // enforces 1:1 with User
      index   : true,
    },

    // ── Professional Identity ─────────────────────────────────────────────────
    title: {
      type     : String,
      maxlength: 50,
      trim     : true,
      default  : null,   // e.g. "Dr.", "Prof."
    },

    specializations: {
      type    : [String],
      default : [],
      validate: {
        validator(v) { return v.length <= 20; },
        message  : 'Cannot store more than 20 specializations',
      },
    },

    yearsOfExperience: {
      type   : Number,
      min    : [0, 'Years of experience cannot be negative'],
      max    : [70, 'Years of experience cannot exceed 70'],
      default: null,
    },

    languages: {
      type    : [String],
      default : ['en'],
      validate: {
        validator(v) { return v.length <= 15; },
        message  : 'Cannot list more than 15 languages',
      },
    },

    // ── Credentials & Verification ────────────────────────────────────────────
    credentials: {
      type    : [CredentialSchema],
      default : [],
      validate: {
        validator(v) { return v.length <= 10; },
        message  : 'Cannot store more than 10 credentials',
      },
    },

    isVerifiedProfessional: {
      type   : Boolean,
      default: false,
      index  : true,
    },

    verificationStatus: {
      type   : String,
      enum   : ['unsubmitted', 'pending', 'approved', 'rejected'],
      default: 'unsubmitted',
    },

    verificationNote: {
      type    : String,
      maxlength: 1000,
      default : null,
    },

    // ── Capacity & Assignments ────────────────────────────────────────────────
    maxStudentCapacity: {
      type   : Number,
      default: 50,
      min    : [1,   'Capacity must be at least 1'],
      max    : [500, 'Capacity cannot exceed 500'],
    },

    /**
     * Direct references to assigned student User IDs.
     * Capped at maxStudentCapacity. Used for fast "my students" queries.
     */
    assignedStudentIds: {
      type    : [{ type: Schema.Types.ObjectId, ref: 'User' }],
      default : [],
      validate: {
        validator(v) { return v.length <= this.maxStudentCapacity; },
        message  : 'Cannot exceed maxStudentCapacity',
      },
    },

    // ── Availability ──────────────────────────────────────────────────────────
    availability: {
      type    : [AvailabilitySlotSchema],
      default : [],
      validate: {
        validator(v) { return v.length <= 28; },
        message  : 'Cannot store more than 28 availability slots',
      },
    },

    // ── Contact & Professional Links ──────────────────────────────────────────
    professionalEmail: {
      type     : String,
      lowercase: true,
      trim     : true,
      maxlength: 254,
      match    : [/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'Invalid email format'],
      default  : null,
    },

    websiteUrl: {
      type    : String,
      maxlength: 500,
      match   : [/^https?:\/\/.+/, 'Website must start with http:// or https://'],
      default : null,
    },

    linkedinUrl: {
      type    : String,
      maxlength: 500,
      default : null,
    },

    // ── Platform Status ───────────────────────────────────────────────────────
    isAcceptingStudents: {
      type   : Boolean,
      default: true,
      index  : true,
    },

    // ── Statistics (denormalised) ─────────────────────────────────────────────
    statistics: { type: StatisticsSchema, default: () => ({}) },
  },
  {
    timestamps: true,
    versionKey: '__v',
    toJSON    : { virtuals: true },
    toObject  : { virtuals: true },
  }
);

// ─── Virtuals ─────────────────────────────────────────────────────────────────

PsychologistSchema.virtual('currentStudentCount').get(function () {
  return this.assignedStudentIds.length;
});

PsychologistSchema.virtual('capacityAvailable').get(function () {
  return this.maxStudentCapacity - this.assignedStudentIds.length;
});

PsychologistSchema.virtual('hasCapacity').get(function () {
  return this.capacityAvailable > 0 && this.isAcceptingStudents;
});

PsychologistSchema.virtual('user', {
  ref        : 'User',
  localField : 'userId',
  foreignField: '_id',
  justOne    : true,
});

// ─── Indexes ──────────────────────────────────────────────────────────────────

PsychologistSchema.index({ userId: 1 },                           { unique: true, name: 'idx_psychologists_user' });
PsychologistSchema.index({ isVerifiedProfessional: 1, isAcceptingStudents: 1 }, { name: 'idx_psychologists_verified_accepting' });
PsychologistSchema.index({ specializations: 1 },                 { name: 'idx_psychologists_specializations' });
PsychologistSchema.index({ languages: 1 },                       { name: 'idx_psychologists_languages' });
PsychologistSchema.index({ assignedStudentIds: 1 },              { name: 'idx_psychologists_students' });
PsychologistSchema.index({ verificationStatus: 1 },              { name: 'idx_psychologists_verification' });

// ─── Instance Methods ─────────────────────────────────────────────────────────

PsychologistSchema.methods.assignStudent = function (studentId) {
  if (this.assignedStudentIds.length >= this.maxStudentCapacity) {
    throw new Error('Psychologist has reached maximum student capacity');
  }
  const alreadyAssigned = this.assignedStudentIds.some(id => id.equals(studentId));
  if (!alreadyAssigned) {
    this.assignedStudentIds.push(studentId);
    this.statistics.totalStudentsAssigned += 1;
  }
};

PsychologistSchema.methods.unassignStudent = function (studentId) {
  this.assignedStudentIds = this.assignedStudentIds.filter(id => !id.equals(studentId));
};

PsychologistSchema.methods.incrementReviewStats = function () {
  this.statistics.totalReportsReviewed += 1;
  this.statistics.lastActivityAt = new Date();
};

// ─── Static Methods ───────────────────────────────────────────────────────────

PsychologistSchema.statics.findAvailable = function () {
  return this.find({ isVerifiedProfessional: true, isAcceptingStudents: true })
    .where('assignedStudentIds').lt(this.maxStudentCapacity)
    .populate('userId', 'firstName lastName email profile.avatarUrl');
};

// ─── Export ───────────────────────────────────────────────────────────────────

module.exports = model('Psychologist', PsychologistSchema);
