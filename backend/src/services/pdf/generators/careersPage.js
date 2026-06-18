'use strict';

const { PAGE, COLORS, FONTS, TYPE, SPACE, RADIUS } = require('../utils/design');
const draw = require('../utils/draw');
const { _renderPageHeader, _renderPageFooter } = require('./assessmentPage');

/**
 * Renders the Career Recommendations page.
 * Shows each career with match score, confidence bars (RF/XGB/Ensemble),
 * salary info, key skills, top feature drivers, and growth outlook.
 */
function renderCareersPage(doc, data) {
  const { careers, confidence } = data;
  const { marginX, marginY, contentWidth } = PAGE;

  _renderPageHeader(doc, 'Career Recommendations', 'Page 3', data);

  let y = marginY + 44;

  // ── Section heading ───────────────────────────────────────────
  y = draw.sectionHeading(doc, marginX, y, 'Top Career Recommendations', {
    color:     COLORS.violet,
    badgeText: `${careers.length} matches`,
    badgeVar:  'violet',
  });
  y += 8;

  // Models agreement indicator
  if (confidence.modelsAgree) {
    draw.filledRect(doc, marginX, y, 220, 20, {
      fill: COLORS.successLight, radius: RADIUS.pill,
    });
    doc.save().font(FONTS.bold).fontSize(8).fillColor('#065F46')
      .text('✓  Both models agree on top recommendation', marginX + 10, y + 5, { lineBreak: false })
      .restore();
  }
  y += 30;

  // ── Career cards ──────────────────────────────────────────────
  careers.forEach((career, idx) => {
    const cardH = _estimateCareerCardHeight(career);
    y = _renderCareerCard(doc, career, marginX, y, contentWidth, idx, careers.length);
    y += SPACE.lg;
  });

  // ── Confidence comparison chart ───────────────────────────────
  if (y + 160 < PAGE.bottom - 40) {
    y = draw.sectionHeading(doc, marginX, y, 'Model Confidence Comparison', {
      color: COLORS.azure,
    });
    y += 8;

    const chartData = careers.map(c => ({
      label:    c.title,
      ensemble: c.matchScore,
      rf:       c.rfScore,
      xgb:      c.xgbScore,
    }));

    y = draw.barChart(doc, chartData, marginX, y, contentWidth);
  }

  _renderPageFooter(doc, 'Page 3', data);
}

// ── Career card renderer ──────────────────────────────────────────
function _renderCareerCard(doc, career, x, y, w, idx, total) {
  const isTop   = idx === 0;
  const cardH   = _estimateCareerCardHeight(career);
  const accentH = 5;

  // Card shadow + body
  draw.card(doc, x, y, w, cardH, {
    fill:   COLORS.white,
    border: isTop ? '#C7D2FE' : COLORS.gray100,
    radius: RADIUS.lg,
    shadow: isTop,
  });

  // Top accent bar (gradient-like via fill)
  const accentColor = isTop ? COLORS.indigo : idx === 1 ? COLORS.violet : COLORS.azure;
  draw.filledRect(doc, x, y, w, accentH, { fill: accentColor, radius: 0 });
  // Round the top corners
  draw.filledRect(doc, x, y, w, RADIUS.lg, { fill: accentColor, radius: RADIUS.lg });

  let cy = y + accentH + 14;

  // ── Rank badge + title row ─────────────────────────────────────
  const rankColors = ['#6366F1', '#8B5CF6', '#3B82F6'];
  const rankColor  = rankColors[idx] || COLORS.gray400;

  // Rank circle
  doc.save().circle(x + 22, cy + 7, 14).fill(rankColor);
  doc.save().font(FONTS.bold).fontSize(10).fillColor(COLORS.white)
    .text(`#${career.rank}`, x + 14, cy + 2, { lineBreak: false }).restore();

  // Title
  doc.save().font(FONTS.bold).fontSize(14).fillColor(COLORS.gray800)
    .text(career.title, x + 44, cy, { lineBreak: false }).restore();

  // Category badge
  const titleW = doc.font(FONTS.bold).fontSize(14).widthOfString(career.title);
  draw.statusBadge(doc, career.category, x + 46 + titleW + 8, cy + 3, 'indigo');

  // Growth outlook badge
  const growthMap = {
    high_growth: { label: '↑ High Growth', var: 'success' },
    growing:     { label: '↑ Growing',     var: 'success' },
    stable:      { label: '→ Stable',      var: 'default' },
    declining:   { label: '↓ Declining',   var: 'danger'  },
    variable:    { label: '~ Variable',    var: 'warning' },
  };
  const growth = growthMap[career.growthOutlook] || growthMap.stable;
  const growthX = x + w - 90;
  draw.statusBadge(doc, growth.label, growthX, cy + 2, growth.var);

  cy += 24;

  // ── Description ───────────────────────────────────────────────
  doc.save().font(FONTS.regular).fontSize(9).fillColor(COLORS.gray600)
    .text(career.description, x + 14, cy, {
      width: w - 28, lineBreak: true, lineGap: 2,
    }).restore();

  cy += _textHeight(career.description, w - 28, 9, 13) + 10;

  // ── Two-column: Confidence | Skills+Salary ────────────────────
  draw.rule(doc, x + 10, cy, w - 20);
  cy += 10;

  const col1X = x + 14;
  const col2X = x + w / 2 + 10;
  const colW  = w / 2 - 24;

  // Col 1: Confidence scores
  doc.save().font(FONTS.bold).fontSize(8).fillColor(COLORS.gray400)
    .text('MATCH CONFIDENCE', col1X, cy, { lineBreak: false }).restore();
  cy += 14;

  // Match score (big)
  doc.save().font(FONTS.bold).fontSize(24).fillColor(accentColor)
    .text(`${career.matchScore}%`, col1X, cy, { lineBreak: false }).restore();

  // Match label badge
  const labelMap = { 'Excellent': 'success', 'Good': 'indigo', 'Fair': 'warning', 'Poor': 'danger' };
  draw.statusBadge(doc, career.matchLabel, col1X + 60, cy + 6, labelMap[career.matchLabel] || 'default');

  cy += 32;

  // RF / XGB / Ensemble bars
  const barData = [
    { label: 'Ensemble',     value: career.matchScore, color: accentColor  },
    { label: 'Random Forest',value: career.rfScore,    color: COLORS.violet },
    { label: 'XGBoost',      value: career.xgbScore,   color: COLORS.azure  },
  ];
  let barY = cy;
  barData.forEach(b => {
    barY = draw.confidenceRow(doc, col1X, barY, colW, b.label, b.value, b.color);
  });

  // Col 2: Skills + salary
  let c2y = cy - 32;
  doc.save().font(FONTS.bold).fontSize(8).fillColor(COLORS.gray400)
    .text('KEY SKILLS', col2X, c2y, { lineBreak: false }).restore();
  c2y += 14;

  // Skill pills
  let pillX = col2X;
  career.keySkills.forEach((skill, si) => {
    const pW = doc.font(FONTS.bold).fontSize(7).widthOfString(skill) + 14;
    if (pillX + pW > col2X + colW) {
      pillX = col2X;
      c2y += 18;
    }
    draw.filledRect(doc, pillX, c2y, pW, 15, { fill: '#EEF2FF', radius: RADIUS.pill });
    doc.save().font(FONTS.bold).fontSize(7).fillColor('#3730A3')
      .text(skill, pillX + 7, c2y + 4, { lineBreak: false }).restore();
    pillX += pW + 5;
  });
  c2y += 24;

  // Salary
  doc.save().font(FONTS.bold).fontSize(8).fillColor(COLORS.gray400)
    .text('SALARY RANGE (USD)', col2X, c2y, { lineBreak: false }).restore();
  c2y += 13;

  doc.save().font(FONTS.bold).fontSize(11).fillColor(COLORS.success)
    .text(`$${_fmtNum(career.salary.min)} — $${_fmtNum(career.salary.max)}`, col2X, c2y, { lineBreak: false })
    .restore();
  c2y += 16;
  doc.save().font(FONTS.regular).fontSize(8).fillColor(COLORS.gray400)
    .text('per annum · United States average', col2X, c2y, { lineBreak: false }).restore();
  c2y += 20;

  // Top feature drivers
  doc.save().font(FONTS.bold).fontSize(8).fillColor(COLORS.gray400)
    .text('TOP DRIVERS', col2X, c2y, { lineBreak: false }).restore();
  c2y += 13;

  career.topDrivers.forEach(d => {
    const pct = Math.round(d.impact * 100);
    const col = d.direction === 'positive' ? COLORS.success : COLORS.danger;
    const icon = d.direction === 'positive' ? '↑' : '↓';
    doc.save().font(FONTS.regular).fontSize(8).fillColor(COLORS.gray600)
      .text(`${icon} ${d.feature}`, col2X, c2y, { lineBreak: false }).restore();
    doc.save().font(FONTS.bold).fontSize(8).fillColor(col)
      .text(`+${pct}%`, col2X + colW - 30, c2y, { lineBreak: false }).restore();
    c2y += 13;
  });

  return Math.max(barY, c2y) + 4;
}

function _estimateCareerCardHeight(career) {
  // Rough estimate: heading + desc + columns
  const descLines = Math.ceil(career.description.length / 90);
  return 28 + descLines * 13 + 160;
}

function _textHeight(text, w, fontSize, lineHeight) {
  const charsPerLine = Math.floor(w / (fontSize * 0.52));
  const lines = Math.ceil(text.length / charsPerLine);
  return lines * lineHeight;
}

function _fmtNum(n) {
  return (n / 1000).toFixed(0) + 'k';
}

module.exports = { renderCareersPage };
