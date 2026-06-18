'use strict';

const mongoose = require('mongoose');
const { Schema, model } = mongoose;

const CredentialSchema = new Schema({
  type         : { type: String, required: true, maxlength: 100 },
  issuingBody  : { type: String, required: true, maxlength: 200 },
  licenseNumber: { type: String, maxlength: 100, default: null },
  issuedAt     : { type: Date, default: null },
  expiresAt    : { type: Date, default: null },
  verified     : { type: Boolean, default: false },
  verifiedAt   : { type: Date, default: null },
  verifiedBy   : { type: Schema.Types.ObjectId, ref: 'User', default: null },
  documentUrl  : { type: String, maxlength: 1000, select: false, default: null },
}, { _id: true });

const SlotSchema = new Schema({
  dayOfWeek : { type: Number, required: true, min: 0, max: 6 },
  startTime : { type: String, required: true, match: /^\d{2}:\d{2}$/ },
  endTime   : { type: String, required: true, match: /^\d{2}:\d{2}$/ },
  timezone  : { type: String, required: true, maxlength: 100 },
}, { _id: false });

const PsychologistSchema = new Schema({
  userId: {
    type    : Schema.Types.ObjectId,
    ref     : 'User',
    required: true,
    unique  : true,
    index   : true,
  },
  title              : { type: String, maxlength: 50, default: null },
  specializations    : { type: [String], default: [] },
  yearsOfExperience  : { type: Number, min: 0, max: 70, default: null },
  languages          : { type: [String], default: ['en'] },
  credentials        : { type: [CredentialSchema], default: [] },
  isVerifiedProfessional: { type: Boolean, default: false, index: true },
  verificationStatus : {
    type   : String,
    enum   : ['unsubmitted','pending','approved','rejected'],
    default: 'unsubmitted',
  },
  verificationNote   : { type: String, maxlength: 1000, default: null },
  maxStudentCapacity : { type: Number, default: 50, min: 1, max: 500 },
  assignedStudentIds : { type: [{ type: Schema.Types.ObjectId, ref: 'User' }], default: [] },
  availability       : { type: [SlotSchema], default: [] },
  professionalEmail  : { type: String, lowercase: true, maxlength: 254, default: null },
  websiteUrl         : { type: String, maxlength: 500, default: null },
  linkedinUrl        : { type: String, maxlength: 500, default: null },
  isAcceptingStudents: { type: Boolean, default: true, index: true },
  statistics: {
    totalStudentsAssigned : { type: Number, default: 0 },
    totalReportsReviewed  : { type: Number, default: 0 },
    totalAnnotations      : { type: Number, default: 0 },
    lastActivityAt        : { type: Date, default: null },
  },
}, {
  timestamps: true,
  toJSON    : { virtuals: true },
  toObject  : { virtuals: true },
});

// Indexes
PsychologistSchema.index({ isVerifiedProfessional: 1, isAcceptingStudents: 1 });
PsychologistSchema.index({ specializations: 1 });
PsychologistSchema.index({ assignedStudentIds: 1 });
PsychologistSchema.index({ verificationStatus: 1 });

// Virtuals
PsychologistSchema.virtual('currentStudentCount').get(function () {
  return this.assignedStudentIds.length;
});
PsychologistSchema.virtual('hasCapacity').get(function () {
  return this.assignedStudentIds.length < this.maxStudentCapacity && this.isAcceptingStudents;
});
PsychologistSchema.virtual('user', {
  ref: 'User', localField: 'userId', foreignField: '_id', justOne: true,
});

// Methods
PsychologistSchema.methods.assignStudent = function (studentId) {
  if (this.assignedStudentIds.length >= this.maxStudentCapacity) {
    throw new Error('Maximum student capacity reached');
  }
  if (!this.assignedStudentIds.some(id => id.equals(studentId))) {
    this.assignedStudentIds.push(studentId);
    this.statistics.totalStudentsAssigned += 1;
  }
};
PsychologistSchema.methods.unassignStudent = function (studentId) {
  this.assignedStudentIds = this.assignedStudentIds.filter(id => !id.equals(studentId));
};

module.exports = model('Psychologist', PsychologistSchema);
