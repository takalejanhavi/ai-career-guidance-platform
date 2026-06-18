'use strict';

const { PAGE, COLORS, FONTS, SPACE, RADIUS } = require('../utils/design');
const draw = require('../utils/draw');
const { _renderPageHeader, _renderPageFooter } = require('./assessmentPage');

/**
 * Renders the Psychologist Notes page.
 * Includes professional header, structured note sections,
 * psychologist profile card, and digital signature area.
 */
function renderPsychologistPage(doc, data) {
  const { psychologist, student } = data;
  const { marginX, marginY, contentWidth } = PAGE;

  _renderPageHeader(doc, 'Psychologist Notes', 'Page 4', data);

  let y = marginY + 44;

  // ── Psychologist identity card ────────────────────────────────
  const cardH = 70;
  draw.card(doc, marginX, y, contentWidth, cardH, {
    fill: COLORS.offWhite, shadow: false,
  });

  // Green left accent
  draw.filledRect(doc, marginX, y, 6, cardH, { fill: COLORS.success, radius: 0 });
  draw.filledRect(doc, marginX, y, 6, RADIUS.lg, { fill: COLORS.success, radius: RADIUS.lg });
  draw.filledRect(doc, marginX, y + cardH - RADIUS.lg, 6, RADIUS.lg, { fill: COLORS.success, radius: 0 });

  // Avatar
  doc.save().circle(marginX + 44, y + 34, 26).fill('#D1FAE5');
  doc.save().circle(marginX + 44, y + 34, 26).lineWidth(2).stroke(COLORS.success);
  doc.save().font(FONTS.bold).fontSize(13).fillColor('#065F46')
    .text('SM', marginX + 34, y + 27, { lineBreak: false }).restore();

  // Details
  doc.save().font(FONTS.bold).fontSize(13).fillColor(COLORS.gray800)
    .text(psychologist.name, marginX + 80, y + 12, { lineBreak: false }).restore();
  doc.save().font(FONTS.regular).fontSize(8.5).fillColor(COLORS.gray600)
    .text(psychologist.credentials, marginX + 80, y + 28, { lineBreak: false }).restore();
  doc.save().font(FONTS.regular).fontSize(8).fillColor(COLORS.gray400)
    .text(`License: ${psychologist.licenseNumber}  ·  Reviewed: ${_fmt(psychologist.reviewedAt)}`,
      marginX + 80, y + 44, { lineBreak: false }).restore();

  // Verified badge
  draw.statusBadge(doc, '✓ Verified Professional', marginX + contentWidth - 130, y + 26, 'success');

  y += cardH + SPACE.lg;

  // ── Section heading ───────────────────────────────────────────
  y = draw.sectionHeading(doc, marginX, y, 'Professional Assessment Notes', {
    color: COLORS.success,
  });
  y += SPACE.sm;

  // ── Note sections ─────────────────────────────────────────────
  psychologist.notes.forEach((note, i) => {
    const noteH = _estimateNoteHeight(note.content);
    const noteW = contentWidth;

    // Note card
    draw.card(doc, marginX, y, noteW, noteH, {
      fill: COLORS.white, border: COLORS.gray100, shadow: false,
    });

    // Left colored stripe (alternating)
    const stripeColor = [COLORS.success, COLORS.indigo, COLORS.violet, COLORS.azure][i % 4];
    draw.filledRect(doc, marginX, y, 4, noteH, { fill: stripeColor, radius: 0 });
    draw.filledRect(doc, marginX, y, 4, RADIUS.lg, { fill: stripeColor, radius: RADIUS.lg });
    draw.filledRect(doc, marginX, y + noteH - RADIUS.lg, 4, RADIUS.lg, { fill: stripeColor, radius: 0 });

    // Note number badge
    doc.save().circle(marginX + 22, y + 18, 10).fill(stripeColor);
    doc.save().font(FONTS.bold).fontSize(9).fillColor(COLORS.white)
      .text(`${i + 1}`, marginX + 18, y + 13, { lineBreak: false }).restore();

    // Heading
    doc.save().font(FONTS.bold).fontSize(11).fillColor(COLORS.gray800)
      .text(note.heading, marginX + 40, y + 10, { lineBreak: false }).restore();

    // Content
    doc.save().font(FONTS.regular).fontSize(9.5).fillColor(COLORS.gray600)
      .text(note.content, marginX + 14, y + 32, {
        width: noteW - 28, lineBreak: true, lineGap: 3,
      }).restore();

    y += noteH + SPACE.md;
  });

  // ── Disclaimer ────────────────────────────────────────────────
  y += SPACE.sm;
  draw.filledRect(doc, marginX, y, contentWidth, 36, {
    fill: '#FFFBEB', radius: RADIUS.md,
  });
  draw.rule(doc, marginX, y, contentWidth, COLORS.warning, 2);
  doc.save().font(FONTS.bold).fontSize(7.5).fillColor('#92400E')
    .text('DISCLAIMER:', marginX + 10, y + 8, { lineBreak: false }).restore();
  doc.save().font(FONTS.regular).fontSize(7.5).fillColor('#92400E')
    .text(
      'These notes represent professional guidance and should not replace formal career counselling sessions. ' +
      'All recommendations are based on psychometric data and professional judgment.',
      marginX + 68, y + 8, { width: contentWidth - 78, lineBreak: true }
    ).restore();

  y += 50;

  // ── Signature area ────────────────────────────────────────────
  const sigH = 64;
  draw.card(doc, marginX, y, contentWidth, sigH, {
    fill: COLORS.white, border: COLORS.gray100, shadow: false,
  });

  const sigX = marginX + 20;
  const sigY = y + 12;

  // Signature line
  doc.save().moveTo(sigX, sigY + 28).lineTo(sigX + 160, sigY + 28)
    .lineWidth(1).stroke(COLORS.gray400).restore();

  // Signature text (handwriting simulation using italic)
  doc.save().font(FONTS.italic).fontSize(14).fillColor(COLORS.indigoDark)
    .text(psychologist.signature, sigX + 4, sigY + 10, { lineBreak: false }).restore();

  doc.save().font(FONTS.regular).fontSize(8).fillColor(COLORS.gray400)
    .text('Psychologist Signature', sigX + 4, sigY + 32, { lineBreak: false }).restore();

  // Date
  const dateX = sigX + 200;
  doc.save().moveTo(dateX, sigY + 28).lineTo(dateX + 140, sigY + 28)
    .lineWidth(1).stroke(COLORS.gray400).restore();
  doc.save().font(FONTS.bold).fontSize(10).fillColor(COLORS.gray800)
    .text(_fmt(psychologist.reviewedAt, 'date'), dateX + 4, sigY + 14, { lineBreak: false }).restore();
  doc.save().font(FONTS.regular).fontSize(8).fillColor(COLORS.gray400)
    .text('Date of Review', dateX + 4, sigY + 32, { lineBreak: false }).restore();

  // Professional stamp
  const stampX = marginX + contentWidth - 80;
  doc.save().circle(stampX, y + sigH / 2, 28)
    .lineWidth(2).stroke(COLORS.success);
  doc.save().circle(stampX, y + sigH / 2, 22)
    .lineWidth(0.5).stroke(COLORS.success);
  doc.save().font(FONTS.bold).fontSize(5).fillColor(COLORS.success)
    .text('REVIEWED &', stampX - 14, y + sigH / 2 - 12, { lineBreak: false }).restore();
  doc.save().font(FONTS.bold).fontSize(5).fillColor(COLORS.success)
    .text('APPROVED', stampX - 10, y + sigH / 2 - 5, { lineBreak: false }).restore();
  doc.save().font(FONTS.bold).fontSize(7).fillColor(COLORS.success)
    .text('✓', stampX - 3, y + sigH / 2 + 4, { lineBreak: false }).restore();

  _renderPageFooter(doc, 'Page 4', data);
}

function _estimateNoteHeight(content) {
  const lines = Math.ceil(content.length / 95);
  return 40 + lines * 14 + 8;
}

function _fmt(iso, mode = 'full') {
  const d = new Date(iso);
  if (isNaN(d)) return iso;
  if (mode === 'date') return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  return d.toLocaleString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

module.exports = { renderPsychologistPage };
