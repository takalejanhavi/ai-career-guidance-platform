'use strict';

const User        = require('../users/user.model');
const Assessment  = require('../assessment/assessment.model');
const Report      = require('../reports/report.model');
const Permission  = require('../permissions/permission.model');
const Notification = require('../notifications/notification.model');

// ─── Student dashboard ────────────────────────────────────────────────────────

async function getStudentDashboard(userId) {
  const [
    assessmentCount,
    latestAssessment,
    latestReport,
    sharedCount,
    unreadCount,
  ] = await Promise.all([
    Assessment.countDocuments({ userId, status: 'scored' }),
    Assessment.findOne({ userId, status: 'scored' }).sort({ createdAt: -1 }).select('scores status createdAt'),
    Report.findOne({ userId, status: 'ready' }).sort({ createdAt: -1 }).select('title topCareer visibility blockchain.status createdAt'),
    Permission.countDocuments({ grantedBy: userId, isRevoked: false }),
    Notification.countUnread(userId),
  ]);

  // Career distribution from all user reports
  const careerDist = await Report.aggregate([
    { $match: { userId, status: 'ready' } },
    { $unwind: '$careerRecommendations' },
    { $match: { 'careerRecommendations.rank': 1 } },
    { $group: { _id: '$careerRecommendations.category', count: { $sum: 1 } } },
    { $sort: { count: -1 } },
    { $limit: 5 },
  ]);

  // Score trend
  const scoreTrend = await Assessment.find({ userId, status: 'scored' })
    .sort({ createdAt: 1 })
    .limit(10)
    .select('scores.overall createdAt');

  return {
    stats: { assessmentCount, sharedCount, unreadCount },
    latestAssessment,
    latestReport,
    careerDistribution: careerDist,
    scoreTrend: scoreTrend.map(a => ({ date: a.createdAt, overallScore: a.scores?.overall })),
  };
}

// ─── Psychologist dashboard ───────────────────────────────────────────────────

async function getPsychologistDashboard(psychologistId) {
  const [
    sharedWithMe,
    recentActivity,
    unreadCount,
  ] = await Promise.all([
    Permission.find({ grantedTo: psychologistId, isRevoked: false }).populate('reportId', 'title status userId createdAt').populate('grantedBy', 'firstName lastName').sort({ createdAt: -1 }).limit(10),
    Report.find({ reviewedBy: psychologistId }).sort({ reviewedAt: -1 }).limit(5).select('title reviewedAt userId'),
    Notification.countUnread(psychologistId),
  ]);

  // Students who shared reports grouped
  const studentSummary = await Permission.aggregate([
    { $match: { grantedTo: psychologistId, isRevoked: false } },
    { $group: { _id: '$grantedBy', reportCount: { $sum: 1 }, lastSharedAt: { $max: '$createdAt' } } },
    { $sort: { lastSharedAt: -1 } },
    { $limit: 20 },
  ]);

  return { sharedWithMe, recentActivity, studentSummary, unreadCount };
}

// ─── Admin dashboard ──────────────────────────────────────────────────────────

async function getAdminDashboard() {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const [
    totalUsers,
    newUsersThisMonth,
    totalAssessments,
    scoredAssessments,
    totalReports,
    readyReports,
    anchored,
    usersByRole,
    assessmentsByDay,
    topCareers,
  ] = await Promise.all([
    User.countDocuments({ deletedAt: null }),
    User.countDocuments({ createdAt: { $gte: thirtyDaysAgo }, deletedAt: null }),
    Assessment.countDocuments(),
    Assessment.countDocuments({ status: 'scored' }),
    Report.countDocuments({ deletedAt: null }),
    Report.countDocuments({ status: 'ready', deletedAt: null }),
    Report.countDocuments({ 'blockchain.status': 'confirmed' }),

    User.aggregate([
      { $match: { deletedAt: null } },
      { $group: { _id: '$role', count: { $sum: 1 } } },
    ]),

    Assessment.aggregate([
      { $match: { createdAt: { $gte: thirtyDaysAgo } } },
      { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }, count: { $sum: 1 } } },
      { $sort: { '_id': 1 } },
    ]),

    Report.aggregate([
      { $match: { status: 'ready' } },
      { $unwind: '$careerRecommendations' },
      { $match: { 'careerRecommendations.rank': 1 } },
      { $group: { _id: '$careerRecommendations.careerTitle', count: { $sum: 1 }, avgMatch: { $avg: '$careerRecommendations.matchScore' } } },
      { $sort: { count: -1 } },
      { $limit: 10 },
    ]),
  ]);

  return {
    overview: {
      totalUsers, newUsersThisMonth, totalAssessments, scoredAssessments,
      totalReports, readyReports, anchored,
      completionRate: totalAssessments ? Math.round((scoredAssessments / totalAssessments) * 100) : 0,
    },
    usersByRole:    usersByRole.reduce((acc, r) => ({ ...acc, [r._id]: r.count }), {}),
    assessmentsByDay,
    topCareers,
  };
}

// ─── Analytics trends ─────────────────────────────────────────────────────────

async function getAssessmentTrends({ from, to }) {
  const match = { status: 'scored' };
  if (from || to) {
    match.createdAt = {};
    if (from) match.createdAt.$gte = new Date(from);
    if (to)   match.createdAt.$lte = new Date(to);
  }

  return Assessment.aggregate([
    { $match: match },
    { $group: {
      _id  : { $dateToString: { format: '%Y-%W', date: '$createdAt' } },
      count: { $sum: 1 },
      avgOverall: { $avg: '$scores.overall' },
    }},
    { $sort: { _id: 1 } },
  ]);
}

module.exports = { getStudentDashboard, getPsychologistDashboard, getAdminDashboard, getAssessmentTrends };
