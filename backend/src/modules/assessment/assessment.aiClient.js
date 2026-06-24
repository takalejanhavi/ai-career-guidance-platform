'use strict';

/**
 * assessment.aiClient.js
 * ========================
 * The single integration seam between the backend's Assessment data and
 * the AI service's /predict/explain endpoint.
 *
 * Responsibilities:
 *   1. buildFeatureVector()  — assessment responses -> AI raw feature dict
 *   2. callPredictExplain()  — HTTP call with retries, timeout, validation
 *   3. mapToScores()         — assessment responses -> 5 dimension scores
 *   4. mapToRecommendations()— AI top_careers[] -> report.careerRecommendations[]
 *   5. scoreAndRecommend()   — orchestrates all of the above; single entry
 *                               point called by assessment.service.js
 *
 * Error handling:
 *   - Network errors, timeouts, and non-2xx responses throw AIServiceError
 *     (a subclass of AppError) with enough context for the caller to log
 *     and for Bull to decide whether to retry.
 *   - Response validation (via Zod) throws AIResponseValidationError if the
 *     AI service returns a structurally unexpected payload — this should
 *     never happen in normal operation but protects against silent
 *     corruption if the AI service is redeployed with a changed contract.
 */

const axios   = require('axios');
const { z }   = require('zod');
const env     = require('../../config/env');
const logger  = require('../../config/logger');
const AppError = require('../../utils/AppError');
const dto = require('./assessment.dto');

const {
  AI_RAW_FEATURES,
  QUESTION_FEATURE_MAP,
  SECTION_FEATURE_MAP,
  FEATURE_TO_DIMENSION,
  ENGINEERED_FEATURE_TO_DIMENSION,
  CONFIDENCE_TIER_TO_LABEL,
  CAREER_CATEGORY_MAP,
  scoreToTier,
  scoreToPercentile,
  buildNarrative,
} = dto;

// ── Errors ────────────────────────────────────────────────────────────────

class AIServiceError extends AppError {
  constructor(message, { cause, status = 502, code = 'AI_SERVICE_ERROR' } = {}) {
    super(message, status, code);
    this.cause = cause;
  }
}

class AIResponseValidationError extends AppError {
  constructor(message, zodError) {
    super(message, 502, 'AI_RESPONSE_INVALID');
    this.issues = zodError?.issues;
  }
}

// ── Zod schema for /predict/explain response ────────────────────────────────
// Validates only the fields this client actually consumes — additional
// fields the AI service may add in future are ignored (forward-compatible).

const careerMatchSchema = z.object({
  rank:            z.number().int().positive(),
  career:          z.string().min(1),
  confidence_pct:  z.number().min(0).max(100),
  // Accept both v1.1.0 tier names (HIGH/MEDIUM/EMERGING/LOW) and legacy
  // names (Very High/High/Moderate/Low) for backward compatibility.
  confidence_tier: z.enum(['HIGH', 'MEDIUM', 'EMERGING', 'LOW', 'Very High', 'High', 'Moderate', 'Low']),
  rf_confidence:   z.number().optional(),
  xgb_confidence:  z.number().optional(),
  model_agreement: z.number(),
  description:     z.string(),
  key_traits:      z.array(z.string()),
  growth_outlook:  z.string(),
  salary_range:    z.object({
    min:      z.number(),
    max:      z.number(),
    currency: z.string().default('USD'),
  }),
  recommended_roles: z.array(z.string()).optional().default([]),
  top_drivers:     z.array(z.object({
    feature:   z.string(),
    impact:    z.number(),
    direction: z.string().optional(),
  })).optional().default([]),
});

const predictExplainResponseSchema = z.object({
  status: z.literal('success'),
  top_careers: z.array(careerMatchSchema).min(1),
  confidence: z.object({
    top_career_confidence: z.number(),
    confidence_gap:        z.number().optional(),
    prediction_certainty:  z.string().optional(),
    models_agree:          z.boolean().optional(),
    entropy:               z.number().optional(),
  }),
  input: z.record(z.number()).optional(),
  engineered_features: z.record(z.number()).optional(),
  model_info: z.object({
    version:   z.string(),
    n_classes: z.number().optional(),
    ensemble:  z.string().optional(),
  }).optional(),
});

// ── 1. Feature vector builder ────────────────────────────────────────────────

/**
 * Convert assessment responses into the 10-feature dict /predict/explain expects.
 *
 * Each response (rawScore 0-10, section) contributes to one or more AI
 * raw features per QUESTION_FEATURE_MAP. If a question ID isn't mapped,
 * its section's SECTION_FEATURE_MAP entries are used as a fallback.
 *
 * @param {Array<{questionId, rawScore, section}>} responses
 * @returns {Record<string, number>}  e.g. { math_score: 78, science_score: 65, ... }
 */
function buildFeatureVector(responses) {
  const sums   = Object.fromEntries(AI_RAW_FEATURES.map(f => [f, 0]));
  const counts = Object.fromEntries(AI_RAW_FEATURES.map(f => [f, 0]));

  for (const r of responses) {
    if (typeof r.rawScore !== 'number') continue;

    const features = QUESTION_FEATURE_MAP[r.questionId]
      || SECTION_FEATURE_MAP[r.section]
      || [];

    for (const feature of features) {
      sums[feature]   += r.rawScore;
      counts[feature] += 1;
    }
  }

  const vector = {};
  for (const feature of AI_RAW_FEATURES) {
    // rawScore is 0-10 -> scale to 0-100. Default to 50 (neutral) if no
    // response contributed to this feature, so /predict never sees a 0
    // that would be misread as "strongly disagree" across the board.
    vector[feature] = counts[feature] > 0
      ? Math.round((sums[feature] / counts[feature]) * 10)
      : 50;
  }

  return vector;
}

// ── 2. AI service call ───────────────────────────────────────────────────────

/**
 * Call POST /predict/explain on the AI service.
 *
 * @param {Record<string, number>} featureVector  10 raw features, 0-100
 * @param {object} [opts]
 * @param {number} [opts.timeoutMs=30000]
 * @param {number} [opts.retries=2]       Additional attempts after the first
 * @returns {object}  Validated response matching predictExplainResponseSchema
 * @throws {AIServiceError}              Network/HTTP errors after retries exhausted
 * @throws {AIResponseValidationError}   Response shape unexpected
 */
async function callPredictExplain(featureVector, { timeoutMs = 90000, retries = 2 } = {}) {
  const url = `${env.AI_SERVICE_URL}/predict/explain`;
  const payload = { ...featureVector, top_n: 3 };

  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const { data } = await axios.post(url, payload, {
        headers: { 'X-Internal-Token': env.AI_SERVICE_SECRET },
        timeout: timeoutMs,
      });

      const parsed = predictExplainResponseSchema.safeParse(data);
      if (!parsed.success) {
        throw new AIResponseValidationError(
          'AI service returned an unexpected response shape',
          parsed.error
        );
      }
      return parsed.data;

    } catch (err) {
      if (err instanceof AIResponseValidationError) throw err; // don't retry validation errors

      lastErr = err;
      const status = err.response?.status;

      // Don't retry on 4xx — these are payload/config errors that won't
      // resolve with a retry (e.g. 422 validation, 401 auth).
      if (status && status >= 400 && status < 500) break;

      if (attempt < retries) {
        const backoffMs = 500 * 2 ** attempt; // 500ms, 1000ms
        logger.warn(
          '[AIClient] /predict/explain attempt %d failed (%s), retrying in %dms',
          attempt + 1, err.message, backoffMs
        );
        await new Promise(r => setTimeout(r, backoffMs));
      }
    }
  }

  // All attempts exhausted
  const status = lastErr.response?.status;
  const body   = lastErr.response?.data;

  throw new AIServiceError(
    status
      ? `AI service responded with HTTP ${status}: ${body?.message || body?.error || lastErr.message}`
      : `AI service unreachable: ${lastErr.message}`,
    { cause: lastErr, status: status === 404 ? 502 : (status || 502) }
  );
}

// ── 3. Dimension scores from raw responses ───────────────────────────────────

/**
 * Compute the 5 psychometric dimension scores directly from assessment
 * responses. These are independent of the AI prediction — the AI service
 * has no concept of these dimensions.
 *
 * @param {Array<{rawScore, section}>} responses
 * @returns {{aptitude, interest, personality, values, learningStyle, overall}}
 *          Each dimension (except overall) is { score, tier, percentile }
 */
function mapToScores(responses) {
  const SECTION_TO_DIM = {
    aptitude:       'aptitude',
    interest:       'interest',
    personality:    'personality',
    values:         'values',
    learning_style: 'learningStyle',
  };

  const sums   = { aptitude: 0, interest: 0, personality: 0, values: 0, learningStyle: 0 };
  const counts = { ...sums };

  for (const r of responses) {
    if (typeof r.rawScore !== 'number') continue;
    const dim = SECTION_TO_DIM[r.section];
    if (!dim) continue;
    sums[dim]   += r.rawScore;
    counts[dim] += 1;
  }

  const scores = {};
  for (const dim of Object.keys(sums)) {
    const score = counts[dim] > 0 ? Math.round((sums[dim] / counts[dim]) * 10) : 50;
    scores[dim] = {
      score,
      tier      : scoreToTier(score),
      percentile: scoreToPercentile(score),
    };
  }

  const overall = Math.round(
    Object.values(scores).reduce((sum, s) => sum + s.score, 0) / Object.keys(scores).length
  );

  return { ...scores, overall };
}

// ── 4. AI top_careers -> report.careerRecommendations ────────────────────────

/**
 * Map the AI service's top_careers[] into the shape
 * report.careerRecommendations[] expects (CareerRecSchema in report.model.js).
 *
 * @param {object[]} topCareers  Validated top_careers from /predict/explain
 * @returns {object[]}
 */
function mapToRecommendations(topCareers) {
  return topCareers.map((c) => {
    // Use actual per-model scores when present (v1.1.0+); fall back to a
    // model_agreement-based approximation for older AI service responses.
    const rfScore  = c.rf_confidence != null
      ? Math.round(c.rf_confidence * 100)
      : Math.round(c.confidence_pct * (1 + (1 - c.model_agreement) * 0.05));
    const xgbScore = c.xgb_confidence != null
      ? Math.round(c.xgb_confidence * 100)
      : Math.round(c.confidence_pct * (1 - (1 - c.model_agreement) * 0.05));

    return {
      rank:             c.rank,
      careerSlug:       _slugify(c.career),
      careerTitle:      c.career,
      category:         CAREER_CATEGORY_MAP[c.career] || 'General',
      matchScore:       Math.round(c.confidence_pct),
      matchLabel:       CONFIDENCE_TIER_TO_LABEL[c.confidence_tier] || 'fair',
      confidenceTier:   c.confidence_tier,
      modelAgreement:   Number(c.model_agreement.toFixed(4)),
      description:      c.description,
      keySkills:        c.key_traits,
      growthOutlook:    _normalizeGrowth(c.growth_outlook),
      salaryRange: {
        min:      c.salary_range.min,
        max:      c.salary_range.max,
        currency: c.salary_range.currency || 'USD',
      },
      recommendedRoles: c.recommended_roles || [],
      topDrivers:       c.top_drivers || [],
      dimensionWeights: _aggregateDimensionWeights(c.top_drivers),
      rfScore,
      xgbScore,
    };
  });
}

/**
 * Build dimensionWeights from top_drivers[]. top_drivers may contain BOTH
 * raw features (e.g. "math_score") and engineered features (e.g.
 * "stem_vs_social_ratio", "social_aptitude") produced by the AI service's
 * feature engineering pipeline. ENGINEERED_FEATURE_TO_DIMENSION extends
 * FEATURE_TO_DIMENSION to cover these. Unrecognised feature names
 * (e.g. "score_variance", which has no clear dimension owner) are ignored.
 */
function _aggregateDimensionWeights(topDrivers) {
  const weights = { aptitude: 0, interest: 0, personality: 0, values: 0, learningStyle: 0 };
  for (const driver of topDrivers || []) {
    const dim = FEATURE_TO_DIMENSION[driver.feature] || ENGINEERED_FEATURE_TO_DIMENSION[driver.feature];
    if (dim) weights[dim] += Math.abs(driver.impact);
  }
  for (const k of Object.keys(weights)) weights[k] = Number(weights[k].toFixed(4));
  return weights;
}

function _normalizeGrowth(outlook) {
  const allowed = ['declining', 'stable', 'growing', 'high_growth'];
  return allowed.includes(outlook) ? outlook : 'stable';
}

function _slugify(text) {
  return text.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

// ── 5. Orchestrator ───────────────────────────────────────────────────────────

/**
 * Full scoring pipeline: assessment responses -> { scores, recommendations,
 * narrative, modelVersion, confidence }.
 *
 * This is the single function assessment.service.js calls. It encapsulates
 * the entire AI integration — callers never construct AI requests or parse
 * AI responses directly.
 *
 * @param {object} assessment  Mongoose Assessment document (needs .responses, .userId populated for firstName)
 * @param {string} firstName   Student's first name, for narrative generation
 * @returns {Promise<{
 *   scores: object,
 *   recommendations: object[],
 *   narrative: string,
 *   modelVersion: string,
 *   confidence: number,
 * }>}
 */
async function scoreAndRecommend(assessment, firstName) {
  const responses = assessment.responses || [];

  if (responses.length === 0) {
    throw AppError.badRequest('Cannot score an assessment with no responses', 'NO_RESPONSES');
  }

  // ── Independent: dimension scores from raw responses ─────────────────────
  const scores = mapToScores(responses);

  // ── AI call: career recommendations ───────────────────────────────────────
  const featureVector = buildFeatureVector(responses);
  const aiResponse    = await callPredictExplain(featureVector);

  const recommendations = mapToRecommendations(aiResponse.top_careers);

  const dimensionScores = Object.entries(scores)
    .filter(([k]) => k !== 'overall')
    .map(([dimension, v]) => ({ dimension, score: v.score }));

  const narrative = buildNarrative({
    firstName,
    topCareer: aiResponse.top_careers[0],
    confidenceSummary: aiResponse.confidence,
    dimensionScores,
  });

  return {
    scores,
    recommendations,
    narrative,
    modelVersion: aiResponse.model_info?.version || '1.0.0',
    confidence:   aiResponse.confidence.top_career_confidence,
    // Raw AI data preserved for debugging / future use — not persisted
    // unless assessment.service.js chooses to store it.
    _raw: { featureVector, aiResponse },
  };
}

module.exports = {
  buildFeatureVector,
  callPredictExplain,
  mapToScores,
  mapToRecommendations,
  scoreAndRecommend,
  AIServiceError,
  AIResponseValidationError,
  // exported for unit testing
  predictExplainResponseSchema,
};
