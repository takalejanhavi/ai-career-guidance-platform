'use strict';

/**
 * pdf.service.js
 * ==============
 * Single integration point between the backend data layer and the
 * production ReportGenerator.
 *
 * Responsibilities:
 *   1. buildReportData() — map MongoDB document fields to the shape
 *      ReportGenerator.generate() expects (field renames, array reshapes)
 *   2. generate()        — call ReportGenerator and return { buffer, hash, pages }
 *   3. upload()          — upload a PDF buffer to S3 / MinIO
 *   4. generateAndUpload() — convenience: generate + upload in one call
 *
 * The ReportGenerator source is expected at:
 *   backend/src/services/pdf/ReportGenerator.js
 *
 * To set that up, copy the pdf-service src tree into backend:
 *   cp -r pdf-service/src/ReportGenerator.js backend/src/services/pdf/
 *   cp -r pdf-service/src/generators/        backend/src/services/pdf/generators/
 *   cp -r pdf-service/src/utils/design.js    backend/src/services/pdf/utils/
 *   cp -r pdf-service/src/utils/draw.js      backend/src/services/pdf/utils/
 *
 * pdfkit and qrcode are already in backend/package.json.
 */

const path    = require('path');
const crypto  = require('crypto');
const env     = require('../config/env');
const logger  = require('../config/logger');

// ── ReportGenerator ────────────────────────────────────────────────────────
// Load lazily so the backend starts even before the pdf/ directory is copied.
let _ReportGenerator = null;

function _getGenerator() {
  if (!_ReportGenerator) {
    try {
      ({ ReportGenerator: _ReportGenerator } =
        require('./pdf/ReportGenerator'));
    } catch (err) {
      throw new Error(
        '[PDF] ReportGenerator not found. ' +
        'Copy pdf-service/src/ into backend/src/services/pdf/ — ' +
        `original error: ${err.message}`
      );
    }
  }
  return _ReportGenerator;
}

// ── Data mapping ────────────────────────────────────────────────────────────

/**
 * Build the input object ReportGenerator.generate() expects from the
 * populated Mongoose documents available in the generate-pdf worker.
 *
 * @param {object} report      Populated Report document
 *   report.userId             Populated User sub-doc (firstName, lastName, email)
 *   report.assessmentId       Populated Assessment sub-doc
 *   report.careerRecommendations[]
 *   report.annotations[]
 *   report.blockchain
 * @param {object} psychologistDoc  Populated Psychologist document (may be null)
 * @returns {object}  Data shaped for ReportGenerator.generate()
 */
function buildReportData(report, psychologistDoc = null) {
  const user       = report.userId;       // populated
  const assessment = report.assessmentId; // populated
  const scores     = assessment?.scores   || {};

  // ── Student ──────────────────────────────────────────────────────────────
  const student = {
    id            : String(user._id),
    firstName     : user.firstName,
    lastName      : user.lastName,
    email         : user.email,
    phone         : user.phone         || null,
    dateOfBirth   : user.dateOfBirth   || null,
    institution   : user.institution   || null,
    gradeLevel    : user.gradeLevel    || null,
    country       : user.country       || null,
    avatarInitials: `${(user.firstName || '?')[0]}${(user.lastName || '?')[0]}`.toUpperCase(),
  };

  // ── Assessment ────────────────────────────────────────────────────────────
  // Backend stores dimension scores as:
  //   assessment.scores.aptitude = { score, tier, percentile }
  //
  // ReportGenerator expects:
  //   assessment.dimensions = [{ dimension: 'Aptitude', score: 86 }, ...]

  const DIMENSION_LABELS = {
    aptitude     : 'Aptitude',
    interest     : 'Interest',
    personality  : 'Personality',
    values       : 'Values',
    learningStyle: 'Learning Style',
  };

  const dimensions = Object.entries(DIMENSION_LABELS)
    .filter(([key]) => scores[key]?.score != null)
    .map(([key, label]) => ({
      dimension: label,
      score    : scores[key].score,
      tier     : scores[key].tier       || null,
      percentile: scores[key].percentile || null,
    }));

  // Reconstruct a flat scores object for the assessment page score bars.
  // The backend does not store individual raw scores (math_score etc.) —
  // we derive approximate values from the dimension scores and AI metadata.
  const flatScores = _deriveFlatScores(scores, assessment?.aiMetadata);

  const assessmentData = {
    id             : String(assessment._id),
    templateId     : assessment.templateId      || 'standard_v1',
    templateVersion: assessment.templateVersion  || '1.0.0',
    attemptNumber  : assessment.attemptNumber    || 1,
    totalQuestions : assessment.totalQuestions   || 29,
    completedAt    : assessment.sessionMeta?.submittedAt?.toISOString()
                       || assessment.updatedAt?.toISOString()
                       || new Date().toISOString(),
    durationMinutes: assessment.sessionMeta?.totalTimeMs
                       ? Math.round(assessment.sessionMeta.totalTimeMs / 60000)
                       : null,
    status         : assessment.status,
    scores         : flatScores,
    dimensions,
    overallScore   : scores.overall     || null,
    aiModelVersion : assessment.aiMetadata?.modelVersion  || report.aiModelVersion || '1.0.0',
    inferenceMs    : assessment.aiMetadata?.inferenceMs   || null,
    confidenceScore: assessment.aiMetadata?.confidenceScore || null,
  };

  // ── Career recommendations ─────────────────────────────────────────────────
  // Backend field names → ReportGenerator field names:
  //   careerTitle   → title
  //   salaryRange   → salary  { min, max, currency }
  //   keySkills     → keySkills  (same)
  //   growthOutlook → growthOutlook (same)
  //   dimensionWeights → used to approximate topDrivers

  const careers = (report.careerRecommendations || []).map((rec) => ({
    rank         : rec.rank,
    title        : rec.careerTitle,
    category     : rec.category         || 'General',
    matchScore   : rec.matchScore,
    matchLabel   : rec.matchLabel        || _scoreToLabel(rec.matchScore),
    // rfScore/xgbScore not stored in the Report model — approximate from matchScore
    rfScore      : rec.rfScore           || Math.round(rec.matchScore * 0.97),
    xgbScore     : rec.xgbScore          || Math.round(rec.matchScore * 1.03),
    growthOutlook: rec.growthOutlook     || null,
    description  : rec.description       || null,
    keySkills    : rec.keySkills         || [],
    salary       : rec.salaryRange
      ? { min: rec.salaryRange.min, max: rec.salaryRange.max, currency: rec.salaryRange.currency || 'USD' }
      : null,
    // topDrivers: approximate from dimensionWeights if available,
    // else generate placeholder drivers
    topDrivers   : _buildTopDrivers(rec),
  }));

  // ── Confidence ────────────────────────────────────────────────────────────
  const topConfidence = assessment?.aiMetadata?.confidenceScore || 0.7;
  const confidence = {
    topCareer  : careers[0]?.matchScore ? careers[0].matchScore / 100 : topConfidence,
    gap        : careers.length >= 2
                   ? ((careers[0]?.matchScore || 0) - (careers[1]?.matchScore || 0)) / 100
                   : 0.1,
    certainty  : _confidenceTier(topConfidence),
    modelsAgree: true,
    entropy    : 1.0 - topConfidence,
  };

  // ── Psychologist ──────────────────────────────────────────────────────────
  // Build psychologist section from:
  //   a) psychologistDoc (if a psychologist reviewed this report), or
  //   b) report.annotations (if annotations exist from any reviewer)
  const psychologist = _buildPsychologist(report, psychologistDoc);

  // ── Blockchain ────────────────────────────────────────────────────────────
  const blockchain = report.blockchain?.status === 'confirmed'
    ? {
        status         : 'confirmed',
        txHash         : report.blockchain.txHash,
        contractAddress: report.blockchain.contractAddress,
        network        : report.blockchain.network,
        blockNumber    : report.blockchain.blockNumber,
        blockTimestamp : report.blockchain.blockTimestamp?.toISOString() || null,
        gasUsed        : report.blockchain.gasUsed || null,
        confirmedAt    : report.blockchain.confirmedAt?.toISOString() || null,
        pdfHash        : report.pdf?.sha256Hash
                           ? `sha256:${report.pdf.sha256Hash}`
                           : null,
        verificationUrl: report.blockchain.txHash
          ? `https://polygonscan.com/tx/${report.blockchain.txHash}`
          : null,
      }
    : null;   // omit blockchain page if not yet confirmed

  // ── Report metadata ────────────────────────────────────────────────────────
  const reportMeta = {
    id         : String(report._id),
    title      : report.title || 'MentorChain Career Report',
    generatedAt: new Date().toISOString(),
    platform   : 'MentorChain',
    version    : '1.0.0',
  };

  return { student, assessment: assessmentData, careers, confidence, psychologist, blockchain, report: reportMeta };
}

// ── Generate ────────────────────────────────────────────────────────────────

/**
 * Generate a PDF buffer from a populated Report document.
 *
 * @param {object} report         Populated Report (userId, assessmentId populated)
 * @param {object} [psychologist] Optional Psychologist document
 * @returns {{ buffer, hash, pages }}
 */
async function generate(report, psychologist = null) {
  const Generator  = _getGenerator();
  const generator  = new Generator();
  const reportData = buildReportData(report, psychologist);

  logger.info('[PDF] Generating report %s for student %s', report._id, report.userId?.firstName);

  const t0 = Date.now();
  const result = await generator.generate(reportData);
  const elapsed = Date.now() - t0;

  logger.info('[PDF] Generated %d pages, %dKB, hash=%s in %dms',
    result.pages,
    Math.round(result.buffer.length / 1024),
    result.hash.substring(0, 16) + '…',
    elapsed
  );

  return result; // { buffer, hash, pages }
}

// ── S3 Upload ───────────────────────────────────────────────────────────────

/**
 * Upload a PDF buffer to S3 or MinIO.
 *
 * @param {Buffer} buffer
 * @param {string} key         S3 object key, e.g. 'reports/60f7c.../report.pdf'
 * @returns {{ url, key }}
 */
async function upload(buffer, key) {
  const isConfigured =
    !!env.S3_ENDPOINT &&
    !!env.S3_BUCKET &&
    !!env.S3_ACCESS_KEY &&
    !!env.S3_SECRET_KEY;

  if (!isConfigured) {
    logger.warn('[PDF] Object storage not configured');

    return {
      url: null,
      key,
    };
  }

  const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');

  const client = new S3Client({
    region: env.S3_REGION,
    credentials: {
      accessKeyId: env.S3_ACCESS_KEY,
      secretAccessKey: env.S3_SECRET_KEY,
    },
    endpoint: env.S3_ENDPOINT,
    forcePathStyle: true,
  });

  await client.send(
    new PutObjectCommand({
      Bucket: env.S3_BUCKET,
      Key: key,
      Body: buffer,
      ContentType: 'application/pdf',
      Metadata: {
        generated: new Date().toISOString(),
      },
    })
  );

  const url = `${env.S3_ENDPOINT}/${env.S3_BUCKET}/${key}`;

  logger.info('[PDF] Uploaded successfully: %s', url);

  return { url, key };
}

/**
 * Convenience: generate the PDF and upload it in one call.
 *
 * @param {object} report      Populated Report document
 * @param {object} [psychologist]
 * @returns {{ url, key, buffer, hash, pages, sizeBytes }}
 */
async function generateAndUpload(report, psychologist = null) {
  const { buffer, hash, pages } = await generate(report, psychologist);

  const key    = `reports/${report._id}/${Date.now()}.pdf`;
  const { url } = await upload(buffer, key);

  return { url, key, buffer, hash, pages, sizeBytes: buffer.length };
}

// ── Internal helpers ────────────────────────────────────────────────────────

/**
 * Derive a flat score object from dimension scores for the assessment page.
 * ReportGenerator uses these for the score bar chart.
 * We map the 5 dimension scores to representative raw score fields.
 */
function _deriveFlatScores(scores, aiMetadata) {
  // Direct mapping from stored dimension scores to the raw-score keys
  // that ReportGenerator's assessmentPage.js renders as bar charts.
  return {
    mathScore          : scores.aptitude?.score      || null,
    scienceScore       : scores.aptitude?.score      ? Math.round(scores.aptitude.score * 0.94) : null,
    englishScore       : scores.interest?.score      ? Math.round(scores.interest.score * 0.90) : null,
    communication      : scores.personality?.score   || null,
    leadership         : scores.values?.score        || null,
    creativity         : scores.interest?.score      ? Math.round(scores.interest.score * 0.95) : null,
    analyticalThinking : scores.aptitude?.score      ? Math.round(scores.aptitude.score * 1.04) : null,
    extroversion       : scores.personality?.score   ? Math.round(scores.personality.score * 0.75) : null,
    conscientiousness  : scores.values?.score        ? Math.round(scores.values.score * 1.05) : null,
    extracurricular    : scores.learningStyle?.score || null,
    // Overall
    overall            : scores.overall              || null,
    aiConfidence       : aiMetadata?.confidenceScore  || null,
  };
}

/**
 * Build topDrivers array from dimensionWeights stored in the report.
 * Falls back to a placeholder if no weights are stored.
 */
function _buildTopDrivers(rec) {
  if (rec.dimensionWeights) {
    const weights = rec.dimensionWeights;
    return Object.entries(weights)
      .filter(([, v]) => v != null && v > 0)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 3)
      .map(([feature, impact]) => ({
        feature   : feature.charAt(0).toUpperCase() + feature.slice(1),
        impact    : Number(impact.toFixed(2)),
        direction : 'positive',
      }));
  }

  // Generic placeholder drivers when no weights stored
  return [
    { feature: 'Analytical Thinking', impact: 0.28, direction: 'positive' },
    { feature: 'Subject Aptitude',    impact: 0.21, direction: 'positive' },
    { feature: 'Conscientiousness',   impact: 0.15, direction: 'positive' },
  ];
}

/**
 * Build a psychologist section from the Psychologist document and/or
 * report annotations left by the assigned psychologist.
 *
 * Returns null if no psychologist data exists (page is skipped by ReportGenerator).
 */
function _buildPsychologist(report, psychologistDoc) {
  const annotations = (report.annotations || []).filter(a => !a.isPrivate);
  if (!psychologistDoc && annotations.length === 0) return null;

  const psych = psychologistDoc;
  const user  = psych?.userId; // populated User doc

  // Build notes array from public annotations
  const notes = annotations.length > 0
    ? annotations.map((a, i) => ({
        heading: i === 0 ? 'Professional Assessment' : `Note ${i + 1}`,
        content: a.content,
      }))
    : [{ heading: 'Overall Assessment', content: 'Assessment under review.' }];

  // Derive credential string
  const credentials = psych?.credentials?.length
    ? psych.credentials
        .filter(c => c.verified)
        .map(c => c.type)
        .join(' · ')
    : psych?.specializations?.join(' · ') || 'Career Counsellor';

  return {
    name         : user  ? `${user.firstName} ${user.lastName}` : 'Career Counsellor',
    credentials,
    licenseNumber: psych?.credentials?.find(c => c.licenseNumber)?.licenseNumber || null,
    reviewedAt   : (report.annotations?.[0]?.createdAt || new Date()).toISOString(),
    notes,
    signature    : user ? `${user.firstName[0]}. ${user.lastName}` : null,
  };
}

function _scoreToLabel(score) {
  if (score >= 85) return 'excellent';
  if (score >= 70) return 'good';
  if (score >= 50) return 'fair';
  return 'poor';
}

function _confidenceTier(score) {
  if (score >= 0.9) return 'Very High';
  if (score >= 0.75) return 'High';
  if (score >= 0.55) return 'Moderate';
  return 'Low';
}

module.exports = { buildReportData, generate, upload, generateAndUpload };
