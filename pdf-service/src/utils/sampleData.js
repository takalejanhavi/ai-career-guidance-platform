'use strict';

/**
 * Sample report data representing a complete career assessment result.
 * All fields mirror the shape expected by ReportGenerator.generate().
 */
const SAMPLE_REPORT = {
  // ── Student info ───────────────────────────────────────────────
  student: {
    id:           'STU-2024-10482',
    firstName:    'Alexandra',
    lastName:     'Chen',
    email:        'a.chen@university.edu',
    phone:        '+1 (415) 555-0192',
    dateOfBirth:  '2001-03-14',
    institution:  'Stanford University',
    gradeLevel:   'Year 2 — Computer Science',
    country:      'United States',
    avatarInitials: 'AC',
  },

  // ── Assessment metadata ────────────────────────────────────────
  assessment: {
    id:             'ASS-2024-88321',
    templateId:     'standard_v1',
    templateVersion:'1.0.0',
    attemptNumber:  1,
    totalQuestions: 30,
    completedAt:    '2024-11-15T14:32:07Z',
    durationMinutes: 18,
    status:         'scored',

    // Raw scores (0–100)
    scores: {
      mathScore:          88,
      scienceScore:       82,
      englishScore:       70,
      communication:      65,
      leadership:         60,
      creativity:         72,
      analyticalThinking: 90,
      extroversion:       45,
      conscientiousness:  82,
      extracurricular:    55,
    },

    // AI-computed dimension scores
    dimensions: [
      { dimension: 'Aptitude',    score: 86 },
      { dimension: 'Interest',    score: 74 },
      { dimension: 'Personality', score: 62 },
      { dimension: 'Values',      score: 78 },
      { dimension: 'Learning',    score: 68 },
    ],

    overallScore:     78,
    aiModelVersion:   '1.0.0',
    inferenceMs:      247,
    confidenceScore:  0.82,
  },

  // ── Career recommendations ─────────────────────────────────────
  careers: [
    {
      rank:         1,
      title:        'Data Scientist',
      category:     'Technology & Analytics',
      matchScore:   94,
      matchLabel:   'Excellent',
      rfScore:      91,
      xgbScore:     96,
      growthOutlook:'high_growth',
      description:  'Extract insights from complex datasets using statistical modelling and machine learning. Data Scientists translate raw data into actionable business intelligence and predictive systems.',
      keySkills:    ['Python / R', 'Machine Learning', 'Statistical Analysis', 'Data Visualisation', 'SQL'],
      salary: { min: 95_000, max: 175_000, currency: 'USD' },
      topDrivers: [
        { feature: 'Analytical Thinking', impact: 0.31, direction: 'positive' },
        { feature: 'Math Score',          impact: 0.24, direction: 'positive' },
        { feature: 'Conscientiousness',   impact: 0.18, direction: 'positive' },
      ],
    },
    {
      rank:         2,
      title:        'Software Engineer',
      category:     'Technology',
      matchScore:   87,
      matchLabel:   'Excellent',
      rfScore:      89,
      xgbScore:     85,
      growthOutlook:'high_growth',
      description:  'Design and build software systems and applications. Software Engineers apply computer science principles to solve complex problems through elegant code and system architecture.',
      keySkills:    ['Algorithms', 'System Design', 'Cloud Platforms', 'DevOps', 'API Development'],
      salary: { min: 90_000, max: 185_000, currency: 'USD' },
      topDrivers: [
        { feature: 'Analytical Thinking', impact: 0.28, direction: 'positive' },
        { feature: 'Math Score',          impact: 0.22, direction: 'positive' },
        { feature: 'Creativity',          impact: 0.14, direction: 'positive' },
      ],
    },
    {
      rank:         3,
      title:        'Biomedical Researcher',
      category:     'Healthcare & Science',
      matchScore:   71,
      matchLabel:   'Good',
      rfScore:      68,
      xgbScore:     74,
      growthOutlook:'growing',
      description:  'Advance human health through rigorous laboratory research and scientific discovery. Biomedical Researchers investigate disease mechanisms and develop therapeutic approaches.',
      keySkills:    ['Research Methodology', 'Data Analysis', 'Lab Techniques', 'Scientific Writing', 'Grant Writing'],
      salary: { min: 65_000, max: 135_000, currency: 'USD' },
      topDrivers: [
        { feature: 'Science Score',      impact: 0.26, direction: 'positive' },
        { feature: 'Conscientiousness',  impact: 0.21, direction: 'positive' },
        { feature: 'Analytical Thinking',impact: 0.19, direction: 'positive' },
      ],
    },
  ],

  // ── Confidence summary ─────────────────────────────────────────
  confidence: {
    topCareer:   0.94,
    gap:         0.07,
    certainty:   'Very High',
    modelsAgree: true,
    entropy:     0.82,
  },

  // ── Psychologist notes ────────────────────────────────────────
  psychologist: {
    name:           'Dr. Sarah Mitchell',
    credentials:    'PhD Clinical Psychology · Licensed Career Counsellor',
    licenseNumber:  'LCC-CA-2019-004821',
    reviewedAt:     '2024-11-17T09:15:00Z',
    notes: [
      {
        heading: 'Overall Assessment',
        content: 'Alexandra demonstrates an exceptionally strong analytical profile with particular strengths in quantitative reasoning and systematic problem-solving. Her high conscientiousness score (82) combined with strong analytical thinking (90) creates an ideal foundation for data-intensive careers.',
      },
      {
        heading: 'Key Strengths',
        content: 'The combination of strong mathematical aptitude and excellent analytical thinking positions Alexandra at the top of her cohort. Her extracurricular activities suggest genuine intellectual curiosity beyond formal coursework, which is a reliable predictor of long-term career success in research-oriented roles.',
      },
      {
        heading: 'Development Areas',
        content: 'Communication and leadership scores (65, 60) are moderate. I recommend supplementing technical development with public speaking practice, collaborative project leadership, and professional networking activities. These soft skills will become increasingly important as Alexandra advances in her career.',
      },
      {
        heading: 'Career Recommendation',
        content: 'The Data Scientist pathway aligns strongly with Alexandra\'s profile. I specifically recommend exploring roles at the intersection of machine learning research and applied analytics. Graduate study (MSc or PhD) would provide significant long-term career capital given her academic strengths.',
      },
    ],
    signature: 'Dr. S. Mitchell, PhD',
  },

  // ── Blockchain verification ────────────────────────────────────
  blockchain: {
    status:          'confirmed',
    txHash:          '0x4f2a1c8b3e9d7f6a2b4c8e1f3a7b9c2d4e6f8a0b2c4d6e8f0a1b3c5d7e9f1a3b',
    contractAddress: '0xA3f8B2c1D4e5F6a7B8c9D0e1F2a3B4c5D6e7F8a9',
    network:         'Polygon (MATIC)',
    blockNumber:     48_293_101,
    blockTimestamp:  '2024-11-16T08:44:22Z',
    gasUsed:         47_832,
    confirmedAt:     '2024-11-16T08:44:51Z',
    pdfHash:         'sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    verificationUrl: 'https://polygonscan.com/tx/0x4f2a1c8b3e9d7f6a2b4c8e1f',
  },

  // ── Report metadata ────────────────────────────────────────────
  report: {
    id:          'RPT-2024-77341',
    title:       'Career Guidance Report',
    generatedAt: new Date().toISOString(),
    platform:    'MentorChain',
    version:     '1.0.0',
  },
};

module.exports = { SAMPLE_REPORT };
