'use strict';

const { PAGE, COLORS, FONTS, TYPE, SPACE, RADIUS } = require('../utils/design');
const draw = require('../utils/draw');

/**
 * Renders the report cover page.
 * Fills the entire first page with a rich header, student card, and meta info.
 */
function renderCoverPage(doc, data) {
  const { student, report, assessment, confidence } = data;
  const { width, marginX, marginY } = PAGE;

  // ── Hero banner ───────────────────────────────────────────────
  const bannerH = 210;

  // Background base
  draw.filledRect(doc, 0, 0, width, bannerH, {
    fill: COLORS.indigoDark, radius: 0,
  });

  // Decorative circles (brand accent)
  doc.save().circle(width - 60, 30, 120).fillOpacity(0.07).fill(COLORS.white);
  doc.save().circle(width + 20, 160, 100).fillOpacity(0.05).fill(COLORS.azure);
  doc.save().circle(80, bannerH + 10, 90).fillOpacity(0.06).fill(COLORS.violet);

  // Gradient strip at bottom of banner
  draw.filledRect(doc, 0, bannerH - 6, width, 6, { fill: COLORS.indigo, radius: 0 });

  // ── Logo area ─────────────────────────────────────────────────
  const logoX = marginX;
  const logoY = 28;

  // Logo mark (stylised Z / bolt shape)
  const lx = logoX, ly = logoY;
  draw.filledRect(doc, lx, ly, 36, 36, { fill: COLORS.white, radius: 8 });
  doc.save()
    .font(FONTS.bold).fontSize(20)
    .fillColor(COLORS.indigoDark)
    .text('⚡', lx + 3, ly + 7, { lineBreak: false })
    .restore();

  doc.save()
    .font(FONTS.bold).fontSize(18)
    .fillColor(COLORS.white)
    .text('CareerAI', lx + 44, ly + 8, { lineBreak: false })
    .restore();

  doc.save()
    .font(FONTS.regular).fontSize(8.5)
    .fillColor('rgba(255,255,255,0.6)')
    .text('AI-Powered Career Guidance Platform', lx + 44, ly + 28, { lineBreak: false })
    .restore();

  // ── Report title ──────────────────────────────────────────────
  doc.save()
    .font(FONTS.bold).fontSize(28)
    .fillColor(COLORS.white)
    .text('Career Guidance', marginX, 82, { lineBreak: false })
    .restore();

  doc.save()
    .font(FONTS.regular).fontSize(28)
    .fillColor('rgba(255,255,255,0.8)')
    .text('Report', marginX, 114, { lineBreak: false })
    .restore();

  // Certainty badge
  const certColor = confidence.certainty === 'Very High'
    ? '#22C55E' : confidence.certainty === 'High' ? '#F59E0B' : '#94A3B8';
  draw.filledRect(doc, marginX, 148, 130, 22, {
    fill: 'rgba(255,255,255,0.12)', radius: RADIUS.pill,
  });
  doc.save()
    .font(FONTS.bold).fontSize(8)
    .fillColor(certColor)
    .text('●', marginX + 10, 154, { lineBreak: false })
    .restore();
  doc.save()
    .font(FONTS.bold).fontSize(8)
    .fillColor(COLORS.white)
    .text(`${confidence.certainty} Confidence Match`, marginX + 22, 154, { lineBreak: false })
    .restore();

  // Report ID top-right
  doc.save()
    .font(FONTS.regular).fontSize(8)
    .fillColor('rgba(255,255,255,0.5)')
    .text(`Report ID: ${report.id}`, 0, 20, { width: width - marginX, align: 'right', lineBreak: false })
    .restore();

  doc.save()
    .font(FONTS.regular).fontSize(8)
    .fillColor('rgba(255,255,255,0.5)')
    .text(`Generated: ${_formatDate(report.generatedAt)}`, 0, 32, { width: width - marginX, align: 'right', lineBreak: false })
    .restore();

  // ── Student information card ──────────────────────────────────
  const cardX  = marginX;
  const cardY  = bannerH + 24;
  const cardW  = PAGE.contentWidth;
  const cardH  = 132;

  draw.card(doc, cardX, cardY, cardW, cardH, { shadow: true });

  // Avatar circle
  const avX = cardX + 20, avY = cardY + 20;
  const avR  = 36;
  doc.save().circle(avX + avR, avY + avR, avR).fill(COLORS.gray50);
  // Gradient ring
  doc.save()
    .circle(avX + avR, avY + avR, avR)
    .lineWidth(2.5)
    .stroke(COLORS.indigo);

  doc.save()
    .font(FONTS.bold).fontSize(18)
    .fillColor(COLORS.indigoDark)
    .text(student.avatarInitials || `${student.firstName[0]}${student.lastName[0]}`,
      avX, avY + avR - 11, { width: avR * 2, align: 'center', lineBreak: false })
    .restore();

  // Student details
  const detX = cardX + 96;
  const detY = cardY + 18;

  doc.save()
    .font(FONTS.bold).fontSize(15)
    .fillColor(COLORS.gray800)
    .text(`${student.firstName} ${student.lastName}`, detX, detY)
    .restore();

  doc.save()
    .font(FONTS.regular).fontSize(9)
    .fillColor(COLORS.gray600)
    .text(student.email, detX, detY + 20, { lineBreak: false })
    .restore();

  doc.save()
    .font(FONTS.regular).fontSize(9)
    .fillColor(COLORS.gray600)
    .text(`${student.institution}  ·  ${student.gradeLevel}`, detX, detY + 34, { lineBreak: false })
    .restore();

  // Divider
  draw.rule(doc, cardX + 90, cardY + 60, cardW - 90 - 20);

  // Info grid below divider
  const infoY = cardY + 70;
  const col   = cardW / 3;

  const infoItems = [
    { label: 'Student ID',    value: student.id },
    { label: 'Date of Birth', value: _formatDate(student.dateOfBirth, 'date') },
    { label: 'Country',       value: student.country },
    { label: 'Assessment ID', value: assessment.id },
    { label: 'Attempt',       value: `#${assessment.attemptNumber}` },
    { label: 'Completed',     value: _formatDate(assessment.completedAt) },
  ];

  infoItems.forEach((item, i) => {
    const cx = cardX + (i % 3) * col + 20;
    const cy = infoY + Math.floor(i / 3) * 24;
    doc.save().font(FONTS.bold).fontSize(7.5).fillColor(COLORS.gray400)
      .text(item.label.toUpperCase(), cx, cy, { lineBreak: false }).restore();
    doc.save().font(FONTS.regular).fontSize(9).fillColor(COLORS.gray800)
      .text(item.value, cx, cy + 11, { lineBreak: false }).restore();
  });

  // ── Summary stats row ─────────────────────────────────────────
  const statY  = cardY + cardH + 20;
  const statH  = 68;
  const statW  = (cardW - SPACE.md * 2) / 3;

  const stats = [
    { label: 'Overall Score',    value: `${assessment.overallScore}%`, color: COLORS.indigo, sub: 'Across all dimensions' },
    { label: 'Top Match',        value: `${data.careers[0].matchScore}%`, color: COLORS.violet, sub: data.careers[0].title },
    { label: 'Confidence',       value: confidence.certainty, color: COLORS.success, sub: `Entropy: ${confidence.entropy.toFixed(2)}` },
  ];

  stats.forEach((s, i) => {
    const sx = cardX + i * (statW + SPACE.md);
    draw.card(doc, sx, statY, statW, statH, { shadow: false });

    draw.filledRect(doc, sx, statY, statW, 4, {
      fill: s.color, radius: 0,
    });
    // Top radius trick — redraw top corners
    draw.filledRect(doc, sx, statY, statW, 8, {
      fill: s.color, radius: RADIUS.lg,
    });

    doc.save()
      .font(FONTS.bold).fontSize(18)
      .fillColor(s.color)
      .text(s.value, sx + 12, statY + 16, { lineBreak: false })
      .restore();

    doc.save()
      .font(FONTS.bold).fontSize(7.5)
      .fillColor(COLORS.gray400)
      .text(s.label.toUpperCase(), sx + 12, statY + 38, { lineBreak: false })
      .restore();

    doc.save()
      .font(FONTS.regular).fontSize(7.5)
      .fillColor(COLORS.gray600)
      .text(s.sub, sx + 12, statY + 50, { width: statW - 24, lineBreak: false })
      .restore();
  });

  // ── Footer strip ──────────────────────────────────────────────
  const footerY = PAGE.height - 36;
  draw.rule(doc, 0, footerY, width, COLORS.gray100);
  doc.save()
    .font(FONTS.regular).fontSize(7.5)
    .fillColor(COLORS.gray400)
    .text(`${report.platform} · ${report.version} · CONFIDENTIAL`, marginX, footerY + 8, { lineBreak: false })
    .restore();
  doc.save()
    .font(FONTS.regular).fontSize(7.5)
    .fillColor(COLORS.gray400)
    .text('Page 1', 0, footerY + 8, { width: width - marginX, align: 'right', lineBreak: false })
    .restore();
}

// ── Helpers ────────────────────────────────────────────────────────
function _formatDate(iso, mode = 'full') {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d)) return iso;
  if (mode === 'date') return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

module.exports = { renderCoverPage };
