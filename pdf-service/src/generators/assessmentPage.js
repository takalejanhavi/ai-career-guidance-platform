'use strict';

const { PAGE, COLORS, FONTS, TYPE, SPACE, RADIUS, CHART } = require('../utils/design');
const draw = require('../utils/draw');

/**
 * Renders the Assessment Summary page.
 * Shows raw input scores, dimension breakdown with radar chart,
 * and engineered composite feature scores.
 */
function renderAssessmentPage(doc, data) {
  const { assessment, student } = data;
  const { marginX, marginY, contentWidth } = PAGE;

  _renderPageHeader(doc, 'Assessment Summary', 'Page 2', data);

  let y = marginY + 44;

  // ── Raw scores grid ───────────────────────────────────────────
  y = draw.sectionHeading(doc, marginX, y, 'Input Scores', { color: COLORS.indigo });
  y += SPACE.sm;

  const scores = [
    { label: 'Math Score',          value: assessment.scores.mathScore,          color: COLORS.indigo  },
    { label: 'Science Score',       value: assessment.scores.scienceScore,       color: COLORS.azure   },
    { label: 'English Score',       value: assessment.scores.englishScore,       color: COLORS.violet  },
    { label: 'Communication',       value: assessment.scores.communication,      color: COLORS.success },
    { label: 'Leadership',          value: assessment.scores.leadership,         color: COLORS.warning },
    { label: 'Creativity',          value: assessment.scores.creativity,         color: '#EC4899'      },
    { label: 'Analytical Thinking', value: assessment.scores.analyticalThinking, color: COLORS.indigo  },
    { label: 'Extroversion',        value: assessment.scores.extroversion,       color: COLORS.azure   },
    { label: 'Conscientiousness',   value: assessment.scores.conscientiousness,  color: COLORS.violet  },
    { label: 'Extracurricular',     value: assessment.scores.extracurricular,    color: COLORS.success },
  ];

  // Two-column grid of bars
  const colW    = (contentWidth - SPACE.md) / 2;
  const colR    = marginX + colW + SPACE.md;
  let leftY = y, rightY = y;

  scores.forEach((s, i) => {
    const isLeft = i < 5;
    const cx     = isLeft ? marginX : colR;
    let   cy     = isLeft ? leftY   : rightY;

    // Score label
    doc.save()
      .font(FONTS.bold).fontSize(8.5).fillColor(COLORS.gray700 || COLORS.gray800)
      .text(s.label, cx, cy, { lineBreak: false })
      .restore();

    cy += 13;

    // Bar track
    draw.filledRect(doc, cx, cy, colW, 10, { fill: COLORS.gray100, radius: 5 });
    // Bar fill
    const fillW = Math.max((s.value / 100) * colW, 10);
    draw.filledRect(doc, cx, cy, fillW, 10, { fill: s.color, radius: 5 });
    // Value label
    doc.save()
      .font(FONTS.bold).fontSize(8).fillColor(s.color)
      .text(`${s.value}`, cx + fillW + 4, cy + 1, { lineBreak: false })
      .restore();

    cy += 22;
    if (isLeft) leftY = cy; else rightY = cy;
  });

  y = Math.max(leftY, rightY) + SPACE.lg;

  // ── Radar chart + dimension details ──────────────────────────
  y = draw.sectionHeading(doc, marginX, y, 'Dimension Profile', {
    color: COLORS.azure,
    badgeText: `Overall: ${assessment.overallScore}%`,
    badgeVar:  'indigo',
  });
  y += SPACE.sm;

  const radarCX = marginX + 130;
  const radarCY = y + 110;
  const radarR  = 95;

  // Radar chart
  draw.radarChart(doc, assessment.dimensions, radarCX, radarCY, radarR);

  // Dimension detail table (right of radar)
  const tableX = marginX + 280;
  const tableY = y + 12;
  const tableW = contentWidth - 280;

  // Table header
  draw.filledRect(doc, tableX, tableY, tableW, 18, { fill: COLORS.gray50, radius: RADIUS.sm });
  doc.save().font(FONTS.bold).fontSize(7.5).fillColor(COLORS.gray600)
    .text('DIMENSION', tableX + 6, tableY + 5, { lineBreak: false }).restore();
  doc.save().font(FONTS.bold).fontSize(7.5).fillColor(COLORS.gray600)
    .text('SCORE', tableX + tableW - 50, tableY + 5, { lineBreak: false }).restore();
  doc.save().font(FONTS.bold).fontSize(7.5).fillColor(COLORS.gray600)
    .text('TIER', tableX + tableW - 28, tableY + 5, { lineBreak: false }).restore();

  let dimY = tableY + 22;
  const tierColor = (s) => s >= 75 ? COLORS.success : s >= 55 ? COLORS.warning : COLORS.danger;
  const tierLabel = (s) => s >= 75 ? 'High' : s >= 55 ? 'Moderate' : 'Low';

  assessment.dimensions.forEach((dim, i) => {
    if (i % 2 === 0) {
      draw.filledRect(doc, tableX, dimY, tableW, 18, { fill: COLORS.offWhite, radius: 0 });
    }
    // Bar mini
    const miniW = 70;
    const miniX = tableX + 6;
    draw.filledRect(doc, miniX, dimY + 6, miniW, 6, { fill: COLORS.gray100, radius: 3 });
    draw.filledRect(doc, miniX, dimY + 6, (dim.score / 100) * miniW, 6, {
      fill: tierColor(dim.score), radius: 3,
    });

    doc.save().font(FONTS.regular).fontSize(8.5).fillColor(COLORS.gray800)
      .text(dim.dimension, tableX + 84, dimY + 4, { lineBreak: false }).restore();

    doc.save().font(FONTS.bold).fontSize(9).fillColor(tierColor(dim.score))
      .text(`${dim.score}`, tableX + tableW - 52, dimY + 4, { lineBreak: false }).restore();

    // Tier badge
    draw.statusBadge(doc, tierLabel(dim.score), tableX + tableW - 32, dimY + 3,
      dim.score >= 75 ? 'success' : dim.score >= 55 ? 'warning' : 'default');

    dimY += 20;
  });

  y = Math.max(radarCY + radarR + 20, dimY + 10);

  // ── Assessment metadata strip ─────────────────────────────────
  y += SPACE.md;
  draw.filledRect(doc, marginX, y, contentWidth, 46, {
    fill: COLORS.gray50, radius: RADIUS.md,
  });

  const metaItems = [
    { label: 'Questions',      value: `${assessment.totalQuestions}` },
    { label: 'Duration',       value: `${assessment.durationMinutes} min` },
    { label: 'AI Model',       value: `v${assessment.aiModelVersion}` },
    { label: 'Inference',      value: `${assessment.inferenceMs}ms` },
    { label: 'Template',       value: assessment.templateId },
    { label: 'Confidence',     value: `${(assessment.confidenceScore * 100).toFixed(0)}%` },
  ];

  const metaCW = contentWidth / metaItems.length;
  metaItems.forEach((m, i) => {
    const mx = marginX + i * metaCW + 10;
    doc.save().font(FONTS.bold).fontSize(7).fillColor(COLORS.gray400)
      .text(m.label.toUpperCase(), mx, y + 8, { lineBreak: false }).restore();
    doc.save().font(FONTS.bold).fontSize(11).fillColor(COLORS.gray800)
      .text(m.value, mx, y + 20, { lineBreak: false }).restore();

    if (i < metaItems.length - 1) {
      draw.rule(doc, marginX + (i + 1) * metaCW, y + 6, 0.5, COLORS.gray200);
      doc.save().moveTo(marginX + (i + 1) * metaCW, y + 6)
        .lineTo(marginX + (i + 1) * metaCW, y + 40)
        .lineWidth(0.5).stroke(COLORS.gray200).restore();
    }
  });

  _renderPageFooter(doc, 'Page 2', data);
}

// ── Shared header/footer ──────────────────────────────────────────
function _renderPageHeader(doc, title, pageLabel, data) {
  const { width, marginX, marginY } = PAGE;

  // Top accent line
  draw.filledRect(doc, 0, 0, width, 4, { fill: COLORS.indigo, radius: 0 });

  // Header content
  doc.save()
    .font(FONTS.bold).fontSize(9)
    .fillColor(COLORS.indigo)
    .text('CareerAI', marginX, marginY + 8, { lineBreak: false })
    .restore();

  doc.save()
    .font(FONTS.regular).fontSize(9)
    .fillColor(COLORS.gray400)
    .text(`— ${title}`, marginX + 48, marginY + 8, { lineBreak: false })
    .restore();

  const studentName = `${data.student.firstName} ${data.student.lastName}`;
  doc.save()
    .font(FONTS.regular).fontSize(8)
    .fillColor(COLORS.gray400)
    .text(studentName, 0, marginY + 8, { width: width - marginX, align: 'right', lineBreak: false })
    .restore();

  draw.rule(doc, marginX, marginY + 24, PAGE.contentWidth, COLORS.gray100);
}

function _renderPageFooter(doc, pageLabel, data) {
  const { width, marginX } = PAGE;
  const y = PAGE.height - 32;

  draw.rule(doc, marginX, y, PAGE.contentWidth, COLORS.gray100);

  doc.save()
    .font(FONTS.regular).fontSize(7.5)
    .fillColor(COLORS.gray400)
    .text(`${data.report.id} · CONFIDENTIAL · ${data.report.platform}`, marginX, y + 8, { lineBreak: false })
    .restore();

  doc.save()
    .font(FONTS.regular).fontSize(7.5)
    .fillColor(COLORS.gray400)
    .text(pageLabel, 0, y + 8, { width: width - marginX, align: 'right', lineBreak: false })
    .restore();
}

module.exports = { renderAssessmentPage, _renderPageHeader, _renderPageFooter };
