'use strict';

/**
 * assessment.dto.js
 * =================
 * Data-transfer shapes and lookup tables for the AI integration layer.
 * No I/O — pure data + pure helper functions only.
 *
 * Exports:
 *   AI_RAW_FEATURES        — ordered list of the 10 features /predict expects
 *   QUESTION_FEATURE_MAP   — questionId -> [AI raw features it contributes to]
 *   SECTION_FEATURE_MAP    — section -> [AI raw features, fallback when a
 *                             question has no explicit mapping]
 *   FEATURE_TO_DIMENSION   — AI raw feature -> assessment dimension
 *                             (reverse mapping, used to build dimensionWeights)
 *   CAREER_CATEGORY_MAP    — career title -> category label (for PDF/report)
 *   CONFIDENCE_TIER_TO_LABEL — AI confidence_tier -> report matchLabel
 *   buildNarrative()       — template-based narrative generator
 *   scoreToTier()          — 0-100 score -> low/moderate/high/very_high
 *   scoreToPercentile()    — 0-100 score -> approximate percentile
 */

// ── AI service raw feature order (must match RAW_FEATURES in predict.py) ───
const AI_RAW_FEATURES = [
  'math_score',
  'science_score',
  'english_score',
  'communication',
  'leadership',
  'creativity',
  'analytical_thinking',
  'extroversion',
  'conscientiousness',
  'extracurricular',
];

// ── Question -> AI feature mapping ──────────────────────────────────────────
// Each question contributes its rawScore (0-10, scaled to 0-100) to one or
// more AI raw features. Questions not listed here fall back to
// SECTION_FEATURE_MAP based on their `section`.
//
// Derived from the semantic content of each question's `text` field in
// question_bank.json (see docs/ai-integration-mapping.md Table 1).
const QUESTION_FEATURE_MAP = {
  // ── Aptitude (5 questions) ────────────────────────────────────────────────
  apt_001: ['math_score', 'analytical_thinking'],          // "solve complex mathematical problems"
  apt_002: ['analytical_thinking', 'science_score'],       // "analyzing data to find patterns"
  apt_003: ['english_score'],                              // "communicate complex ideas clearly in writing"
  apt_004: ['analytical_thinking'],                        // "pick up new technical skills quickly"
  apt_005: ['math_score', 'science_score'],                // "spatial relationships"

  // ── Interest (7 questions) ─────────────────────────────────────────────────
  int_001: ['analytical_thinking'],                        // "computers and technology"
  int_002: ['communication'],                              // "helping others solve problems"
  int_003: ['science_score'],                              // "how living organisms work"
  int_004: ['creativity'],                                 // "creating art or music"
  int_005: ['english_score'],                              // "societies and economies"
  int_006: ['extracurricular'],                            // "building or fixing physical objects"
  int_007: ['leadership', 'creativity'],                   // "business and entrepreneurship"

  // ── Personality (6 questions) ──────────────────────────────────────────────
  per_001: ['extroversion'],                               // "working in teams"
  per_002: ['conscientiousness'],                          // "calm under deadline pressure"
  per_003: ['leadership'],                                 // "taking initiative"
  per_004: ['conscientiousness'],                          // "structured routines"
  per_005: ['extroversion', 'communication'],              // "presenting to large groups"
  per_006: ['conscientiousness'],                          // "attention to small details"

  // ── Values (6 questions) ───────────────────────────────────────────────────
  val_001: ['conscientiousness'],                          // "job security and stability"
  val_002: ['communication'],                              // "positive impact on society"
  val_003: ['leadership'],                                 // "financial reward primary motivation"
  val_004: ['extracurricular'],                            // "work-life balance"
  val_005: ['analytical_thinking'],                        // "continuous learning"
  val_006: ['leadership', 'extroversion'],                 // "recognition and status"

  // ── Learning Style (5 questions) ───────────────────────────────────────────
  ls_001: ['extracurricular'],                             // "hands-on tasks"
  ls_002: ['english_score'],                               // "reading and studying alone"
  ls_003: ['creativity'],                                  // "diagrams and visual aids"
  ls_004: ['communication', 'extroversion'],               // "discussion and debate"
  ls_005: ['conscientiousness'],                           // "structured step-by-step instructions"
};

// ── Section -> AI feature fallback map ──────────────────────────────────────
// Used only if a question ID is not present in QUESTION_FEATURE_MAP
// (defensive — keeps the pipeline working if the question bank changes).
const SECTION_FEATURE_MAP = {
  aptitude:       ['math_score', 'science_score', 'analytical_thinking'],
  interest:       ['english_score', 'creativity'],
  personality:    ['communication', 'extroversion', 'conscientiousness'],
  values:         ['leadership', 'conscientiousness'],
  learning_style: ['extracurricular'],
};

// ── Reverse mapping: AI feature -> assessment dimension ─────────────────────
// Used to build report.careerRecommendations[].dimensionWeights from
// top_drivers[] returned by /predict/explain.
const FEATURE_TO_DIMENSION = {
  math_score:          'aptitude',
  science_score:       'aptitude',
  english_score:       'interest',
  communication:       'personality',
  leadership:          'values',
  creativity:          'interest',
  analytical_thinking: 'aptitude',
  extroversion:        'personality',
  conscientiousness:   'values',
  extracurricular:     'learningStyle',
};

// ── Engineered feature -> dimension map ─────────────────────────────────────
// /predict/explain's top_drivers[] can reference engineered features (the
// 26 features produced by ai-service/utils/feature_engineering.py), not just
// the 10 raw RAW_FEATURES. This extends FEATURE_TO_DIMENSION to cover them.
// Features with no clear single-dimension owner (e.g. score_variance,
// personality_extremity — cross-cutting statistical features) are
// intentionally omitted; their impact is dropped from dimensionWeights
// rather than misattributed.
const ENGINEERED_FEATURE_TO_DIMENSION = {
  academic_overall:           'aptitude',
  stem_aptitude:              'aptitude',
  research_aptitude:          'aptitude',
  interact_quant_reasoning:   'aptitude',
  interact_scientific_rigour: 'aptitude',
  humanities_aptitude:        'interest',
  creative_index:             'interest',
  interact_creative_comm:     'interest',
  social_aptitude:            'personality',
  personality_profile:        'personality',
  leadership_potential:       'values',
  work_ethic:                 'values',
  interact_leadership_expr:   'values',
  stem_vs_social_ratio:       'aptitude',
  // Omitted (no single dimension owner): score_variance, personality_extremity
};

// ── AI confidence_tier -> report matchLabel ─────────────────────────────────
const CONFIDENCE_TIER_TO_LABEL = {
  'Very High': 'excellent',
  'High':      'excellent',
  'Moderate':  'good',
  'Low':       'fair',
};

// ── Career title -> category (for report.careerRecommendations[].category) ──
// Mirrors the 13 careers in ai-service/data/generate_dataset.py CAREERS.
const CAREER_CATEGORY_MAP = {
  'Software Engineer':      'Technology',
  'Data Scientist':         'Technology & Analytics',
  'Biomedical Researcher':  'Healthcare & Science',
  'Civil Engineer':         'Engineering',
  'Business Analyst':       'Business & Finance',
  'Entrepreneur':           'Business & Finance',
  'Marketing Manager':      'Business & Marketing',
  'Graphic Designer':       'Creative & Design',
  'Teacher':                'Education',
  'Nurse':                  'Healthcare & Science',
  'Lawyer':                 'Law & Public Policy',
  'Architect':              'Engineering',
  'Psychologist':           'Healthcare & Science',
};

// ── Score -> tier (matches ScoresSchema enum: low/moderate/high/very_high) ──
function scoreToTier(score) {
  if (score >= 85) return 'very_high';
  if (score >= 70) return 'high';
  if (score >= 50) return 'moderate';
  return 'low';
}

// ── Score -> approximate percentile ─────────────────────────────────────────
// Placeholder linear approximation until cohort-based percentiles exist.
function scoreToPercentile(score) {
  return Math.min(99, Math.round(score * 1.05));
}

// ── Narrative template ──────────────────────────────────────────────────────
/**
 * Build a free-text narrative summary from the AI prediction result.
 * The AI service does not generate narrative text — this is template-based
 * and runs entirely in the backend.
 *
 * @param {object} params
 * @param {string} params.firstName
 * @param {object} params.topCareer       First entry from top_careers[]
 * @param {object} params.confidenceSummary  confidence_summary from AI response
 * @param {object[]} params.dimensionScores  [{ dimension, score }] for the 5 dims
 * @returns {string}
 */
function buildNarrative({ firstName, topCareer, confidenceSummary, dimensionScores }) {
  const strongestDim = [...dimensionScores].sort((a, b) => b.score - a.score)[0];

  const driverNames = (topCareer.top_drivers || [])
    .slice(0, 2)
    .map(d => _humanizeFeature(d.feature))
    .join(' and ');

  const agreementPhrase = confidenceSummary?.models_agree
    ? 'Both predictive models are in strong agreement on this recommendation.'
    : 'The predictive models show some divergence, suggesting multiple career paths may be worth exploring.';

  const parts = [
    `${firstName}'s assessment results show the strongest alignment with `
      + `${topCareer.career} (${topCareer.confidence_pct}% match).`,
  ];

  if (driverNames) {
    parts.push(`This recommendation is primarily driven by strengths in ${driverNames}.`);
  }

  if (strongestDim) {
    parts.push(
      `Their highest-scoring assessment dimension was ${_humanizeDimension(strongestDim.dimension)} `
      + `at ${strongestDim.score}/100, indicating a ${scoreToTier(strongestDim.score).replace('_', ' ')} `
      + `aptitude in this area.`
    );
  }

  parts.push(agreementPhrase);

  return parts.join(' ');
}

function _humanizeFeature(feature) {
  const labels = {
    math_score:          'mathematical aptitude',
    science_score:       'scientific reasoning',
    english_score:       'communication skills',
    communication:       'interpersonal communication',
    leadership:          'leadership qualities',
    creativity:          'creative thinking',
    analytical_thinking: 'analytical thinking',
    extroversion:        'social engagement',
    conscientiousness:   'conscientiousness',
    extracurricular:     'practical, hands-on skills',
  };
  return labels[feature] || feature.replace(/_/g, ' ');
}

function _humanizeDimension(dimension) {
  const labels = {
    aptitude:      'Aptitude',
    interest:      'Interest',
    personality:   'Personality',
    values:        'Values',
    learningStyle: 'Learning Style',
  };
  return labels[dimension] || dimension;
}

module.exports = {
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
};
