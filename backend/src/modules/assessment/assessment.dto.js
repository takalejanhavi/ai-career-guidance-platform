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
// 18 features: 3 academic + 7 personality + 8 career interests
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
  'coding_interest',
  'biology_interest',
  'business_interest',
  'design_interest',
  'teaching_interest',
  'research_interest',
  'people_helping_interest',
  'entrepreneurship_interest',
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
  apt_001: ['math_score', 'analytical_thinking'],
  apt_002: ['analytical_thinking', 'science_score', 'research_interest'],
  apt_003: ['english_score'],
  apt_004: ['analytical_thinking', 'coding_interest'],
  apt_005: ['math_score', 'science_score'],

  // ── Interest (7 questions) ─────────────────────────────────────────────────
  int_001: ['analytical_thinking', 'coding_interest'],
  int_002: ['communication', 'people_helping_interest', 'teaching_interest'],
  int_003: ['science_score', 'biology_interest'],
  int_004: ['creativity', 'design_interest'],
  int_005: ['english_score', 'business_interest'],
  int_006: ['extracurricular'],
  int_007: ['leadership', 'business_interest', 'entrepreneurship_interest'],

  // ── Personality (6 questions) ──────────────────────────────────────────────
  per_001: ['extroversion'],
  per_002: ['conscientiousness'],
  per_003: ['leadership'],
  per_004: ['conscientiousness'],
  per_005: ['extroversion', 'communication'],
  per_006: ['conscientiousness'],

  // ── Values (6 questions) ───────────────────────────────────────────────────
  val_001: ['conscientiousness'],
  val_002: ['communication', 'people_helping_interest'],
  val_003: ['leadership', 'entrepreneurship_interest'],
  val_004: ['extracurricular'],
  val_005: ['analytical_thinking', 'research_interest'],
  val_006: ['leadership', 'extroversion'],

  // ── Learning Style (5 questions) ───────────────────────────────────────────
  ls_001: ['extracurricular'],
  ls_002: ['english_score', 'research_interest'],
  ls_003: ['creativity', 'design_interest'],
  ls_004: ['communication', 'extroversion', 'teaching_interest'],
  ls_005: ['conscientiousness'],
};

// ── Section -> AI feature fallback map ──────────────────────────────────────
// Used only if a question ID is not present in QUESTION_FEATURE_MAP.
const SECTION_FEATURE_MAP = {
  aptitude:       ['math_score', 'science_score', 'analytical_thinking', 'research_interest'],
  interest:       ['english_score', 'creativity', 'coding_interest', 'biology_interest',
                   'business_interest', 'design_interest', 'teaching_interest',
                   'people_helping_interest', 'entrepreneurship_interest'],
  personality:    ['communication', 'extroversion', 'conscientiousness'],
  values:         ['leadership', 'conscientiousness', 'entrepreneurship_interest'],
  learning_style: ['extracurricular', 'research_interest'],
};

// ── Reverse mapping: AI feature -> assessment dimension ─────────────────────
// Used to build report.careerRecommendations[].dimensionWeights from
// top_drivers[] returned by /predict/explain.
const FEATURE_TO_DIMENSION = {
  // Original 10
  math_score:                  'aptitude',
  science_score:               'aptitude',
  english_score:               'interest',
  communication:               'personality',
  leadership:                  'values',
  creativity:                  'interest',
  analytical_thinking:         'aptitude',
  extroversion:                'personality',
  conscientiousness:           'values',
  extracurricular:             'learningStyle',
  // 8 interest features (v1.1.0)
  coding_interest:             'interest',
  biology_interest:            'interest',
  business_interest:           'values',
  design_interest:             'interest',
  teaching_interest:           'interest',
  research_interest:           'aptitude',
  people_helping_interest:     'interest',
  entrepreneurship_interest:   'values',
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
  // Composite academic
  academic_overall:               'aptitude',
  stem_aptitude:                  'aptitude',
  research_aptitude:              'aptitude',
  interact_quant_reasoning:       'aptitude',
  interact_scientific_rigour:     'aptitude',
  stem_vs_social_ratio:           'aptitude',
  // Composite personality / social
  humanities_aptitude:            'interest',
  creative_index:                 'interest',
  interact_creative_comm:         'interest',
  social_aptitude:                'personality',
  personality_profile:            'personality',
  leadership_potential:           'values',
  work_ethic:                     'values',
  interact_leadership_expr:       'values',
  // Career orientation composites (v1.1.0)
  technical_orientation:          'aptitude',
  healthcare_orientation:         'aptitude',
  business_orientation:           'values',
  creative_orientation:           'interest',
  education_orientation:          'interest',
  research_orientation:           'aptitude',
  // New interest-based interactions (v1.1.0)
  interact_coding_analytical:     'aptitude',
  interact_biology_science:       'aptitude',
  interact_design_creativity:     'interest',
  interact_business_leadership:   'values',
  interact_teaching_helping:      'interest',
  // Omitted (cross-cutting): score_variance, personality_extremity
};

// ── AI confidence_tier -> report matchLabel ─────────────────────────────────
// Supports both new tier names (HIGH/MEDIUM/EMERGING/LOW) and old names for
// backward compatibility with reports scored before the v1.1.0 upgrade.
const CONFIDENCE_TIER_TO_LABEL = {
  'HIGH':      'excellent',
  'MEDIUM':    'good',
  'EMERGING':  'fair',
  'LOW':       'fair',
  // legacy v1.0.x names
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
  'Content Writer':         'Creative & Media',
  'Architect':              'Engineering & Design',
  'Medical Doctor':         'Healthcare & Science',
  'Psychologist':           'Healthcare & Science',
  'Teacher / Educator':     'Education',
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
    math_score:               'mathematical aptitude',
    science_score:            'scientific reasoning',
    english_score:            'language & communication skills',
    communication:            'interpersonal communication',
    leadership:               'leadership qualities',
    creativity:               'creative thinking',
    analytical_thinking:      'analytical thinking',
    extroversion:             'social engagement',
    conscientiousness:        'conscientiousness',
    extracurricular:          'practical, hands-on skills',
    coding_interest:          'interest in coding & technology',
    biology_interest:         'interest in biology & life sciences',
    business_interest:        'interest in business',
    design_interest:          'interest in design & visual arts',
    teaching_interest:        'interest in teaching & education',
    research_interest:        'interest in research & discovery',
    people_helping_interest:  'interest in helping people',
    entrepreneurship_interest:'entrepreneurial drive',
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
