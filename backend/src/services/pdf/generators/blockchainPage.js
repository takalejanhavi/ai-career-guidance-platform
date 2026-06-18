'use strict';

const QRCode  = require('qrcode');
const { PAGE, COLORS, FONTS, SPACE, RADIUS } = require('../utils/design');
const draw = require('../utils/draw');
const { _renderPageHeader, _renderPageFooter } = require('./assessmentPage');

/**
 * Renders the Blockchain Verification page.
 * Includes on-chain transaction details, QR code, integrity proof,
 * and a certificate of authenticity.
 */
async function renderBlockchainPage(doc, data) {
  const { blockchain, report, student } = data;
  const { marginX, marginY, contentWidth } = PAGE;

  _renderPageHeader(doc, 'Blockchain Verification', 'Page 5', data);

  let y = marginY + 44;

  // ── Verification status banner ────────────────────────────────
  const bannerH = 52;
  const isConfirmed = blockchain.status === 'confirmed';
  const bannerFill  = isConfirmed ? '#ECFDF5' : '#FEF3C7';
  const bannerBorder = isConfirmed ? COLORS.success : COLORS.warning;
  const bannerText  = isConfirmed
    ? 'This career report has been permanently recorded on the Polygon blockchain and is cryptographically verified.'
    : 'Blockchain anchoring is pending. The report content is valid but has not yet been confirmed on-chain.';

  draw.filledRect(doc, marginX, y, contentWidth, bannerH, {
    fill: bannerFill, stroke: bannerBorder, strokeW: 1.5, radius: RADIUS.md,
  });

  const iconColor = isConfirmed ? '#065F46' : '#92400E';
  doc.save().font(FONTS.bold).fontSize(20).fillColor(iconColor)
    .text(isConfirmed ? '✓' : '⏳', marginX + 16, y + 14, { lineBreak: false }).restore();

  doc.save().font(FONTS.bold).fontSize(10).fillColor(iconColor)
    .text(isConfirmed ? 'VERIFIED ON BLOCKCHAIN' : 'PENDING CONFIRMATION',
      marginX + 44, y + 10, { lineBreak: false }).restore();

  doc.save().font(FONTS.regular).fontSize(8.5).fillColor(iconColor)
    .text(bannerText, marginX + 44, y + 24, { width: contentWidth - 60, lineBreak: false })
    .restore();

  y += bannerH + SPACE.lg;

  // ── Two-column layout: details + QR ──────────────────────────
  y = draw.sectionHeading(doc, marginX, y, 'Transaction Details', {
    color: COLORS.warning,
  });
  y += SPACE.sm;

  const detW  = contentWidth - 130;
  const qrW   = 110;
  const qrX   = marginX + detW + 20;

  // QR code (generated async)
  const qrY = y;
  await _renderQRCode(doc, blockchain.verificationUrl || blockchain.txHash, qrX, qrY, qrW);

  // QR label
  doc.save().font(FONTS.regular).fontSize(7.5).fillColor(COLORS.gray400)
    .text('Scan to verify on PolygonScan', qrX, qrY + qrW + 4, {
      width: qrW, align: 'center', lineBreak: false,
    }).restore();

  // Transaction detail rows
  const kvItems = [
    { key: 'Transaction Hash',  value: blockchain.txHash,          mono: true,  highlight: true  },
    { key: 'Contract Address',  value: blockchain.contractAddress,  mono: true  },
    { key: 'Network',           value: blockchain.network,          mono: false },
    { key: 'Block Number',      value: blockchain.blockNumber.toLocaleString(), mono: true },
    { key: 'Gas Used',          value: blockchain.gasUsed.toLocaleString() + ' wei', mono: false },
    { key: 'Block Timestamp',   value: _fmt(blockchain.blockTimestamp), mono: false },
    { key: 'Confirmed At',      value: _fmt(blockchain.confirmedAt),    mono: false },
  ];

  let detY = y;
  kvItems.forEach((item, i) => {
    const bg = i % 2 === 0 ? COLORS.offWhite : COLORS.white;
    draw.filledRect(doc, marginX, detY, detW, 22, { fill: bg, radius: 0 });

    doc.save().font(FONTS.bold).fontSize(8.5).fillColor(COLORS.gray500 || COLORS.gray600)
      .text(item.key, marginX + 8, detY + 6, { lineBreak: false }).restore();

    const vFont = item.mono ? FONTS.mono : FONTS.regular;
    const vColor = item.highlight ? COLORS.indigo : COLORS.gray800;
    const displayVal = item.mono && item.value.length > 42
      ? item.value.substring(0, 22) + '...' + item.value.substring(item.value.length - 12)
      : item.value;

    doc.save().font(vFont).fontSize(7.5).fillColor(vColor)
      .text(displayVal, marginX + 8 + 140, detY + 6, {
        width: detW - 150, lineBreak: false,
      }).restore();

    detY += 22;
  });

  // Border around the table
  draw.filledRect(doc, marginX, y, detW, detY - y, {
    fill: 'transparent', stroke: COLORS.gray100, strokeW: 0.75, radius: RADIUS.sm,
  });

  y = Math.max(detY, qrY + qrW + 30) + SPACE.lg;

  // ── PDF integrity hash ────────────────────────────────────────
  y = draw.sectionHeading(doc, marginX, y, 'Document Integrity', {
    color: COLORS.indigo,
  });
  y += SPACE.sm;

  draw.filledRect(doc, marginX, y, contentWidth, 44, {
    fill: '#F8F8FF', stroke: '#E0E0FF', strokeW: 0.75, radius: RADIUS.md,
  });

  doc.save().font(FONTS.bold).fontSize(8).fillColor(COLORS.gray400)
    .text('PDF SHA-256 HASH', marginX + 12, y + 8, { lineBreak: false }).restore();

  doc.save().font(FONTS.mono).fontSize(8).fillColor(COLORS.indigoDark)
    .text(blockchain.pdfHash, marginX + 12, y + 22, {
      width: contentWidth - 24, lineBreak: false,
    }).restore();

  y += 58;

  // ── Certificate of authenticity ───────────────────────────────
  y = _renderCertificate(doc, data, y);

  // ── Verification instructions ─────────────────────────────────
  y += SPACE.md;
  draw.sectionHeading(doc, marginX, y, 'How to Verify', { color: COLORS.azure });
  y += SPACE.lg;

  const steps = [
    { step: '1', text: `Visit ${blockchain.verificationUrl || 'https://polygonscan.com'}` },
    { step: '2', text: `Search for transaction hash: ${blockchain.txHash.substring(0, 20)}…` },
    { step: '3', text: 'Confirm the stored hash matches the PDF SHA-256 hash above' },
    { step: '4', text: 'Verify the block timestamp matches the report generation date' },
  ];

  steps.forEach((s) => {
    doc.save().circle(marginX + 10, y + 6, 9).fill(COLORS.azure);
    doc.save().font(FONTS.bold).fontSize(8).fillColor(COLORS.white)
      .text(s.step, marginX + 7, y + 1, { lineBreak: false }).restore();
    doc.save().font(FONTS.regular).fontSize(9).fillColor(COLORS.gray600)
      .text(s.text, marginX + 26, y + 0.5, { lineBreak: false }).restore();
    y += 20;
  });

  _renderPageFooter(doc, 'Page 5', data);
}

// ── Certificate of authenticity ────────────────────────────────────
function _renderCertificate(doc, data, y) {
  const { marginX, contentWidth } = PAGE;
  const { student, report, blockchain } = data;
  const certH = 100;

  // Outer border (double-line effect)
  draw.filledRect(doc, marginX, y, contentWidth, certH, {
    fill: '#FFFEF0', stroke: '#D4A800', strokeW: 1.5, radius: RADIUS.md,
  });
  draw.filledRect(doc, marginX + 4, y + 4, contentWidth - 8, certH - 8, {
    fill: 'transparent', stroke: '#D4A80060', strokeW: 0.5, radius: RADIUS.sm,
  });

  // Corner ornaments
  [
    [marginX + 12,              y + 12],
    [marginX + contentWidth - 28, y + 12],
    [marginX + 12,              y + certH - 22],
    [marginX + contentWidth - 28, y + certH - 22],
  ].forEach(([ox, oy]) => {
    doc.save().font(FONTS.regular).fontSize(14).fillColor('#D4A80080')
      .text('✦', ox, oy, { lineBreak: false }).restore();
  });

  // Title
  doc.save().font(FONTS.bold).fontSize(11).fillColor('#92400E')
    .text('CERTIFICATE OF AUTHENTICITY', 0, y + 14, {
      width: PAGE.width, align: 'center', lineBreak: false,
    }).restore();

  // Body
  const certText =
    `This certifies that the career guidance report for ${student.firstName} ${student.lastName} ` +
    `(${report.id}) was generated by ${report.platform} on ${_fmt(report.generatedAt)} ` +
    `and permanently recorded on the ${data.blockchain.network} blockchain ` +
    `at block #${blockchain.blockNumber.toLocaleString()}.`;

  doc.save().font(FONTS.regular).fontSize(9).fillColor('#92400E')
    .text(certText, marginX + 40, y + 34, {
      width: contentWidth - 80, align: 'center', lineBreak: true, lineGap: 2,
    }).restore();

  doc.save().font(FONTS.italic).fontSize(8.5).fillColor('#B45309')
    .text('This document is tamper-evident. Any alteration will invalidate the blockchain hash.',
      0, y + certH - 20, { width: PAGE.width, align: 'center', lineBreak: false })
    .restore();

  return y + certH;
}

// ── QR code renderer ───────────────────────────────────────────────
async function _renderQRCode(doc, content, x, y, size) {
  try {
    const qrBuffer = await QRCode.toBuffer(content, {
      type:              'png',
      width:             size,
      margin:            1,
      color: { dark: '#0F172A', light: '#FFFFFF' },
      errorCorrectionLevel: 'M',
    });
    doc.image(qrBuffer, x, y, { width: size, height: size });
  } catch (err) {
    // Fallback if QR generation fails
    draw.qrPlaceholder(doc, x, y, size);
  }
}

function _fmt(iso) {
  const d = new Date(iso);
  if (isNaN(d)) return iso;
  return d.toLocaleString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

module.exports = { renderBlockchainPage };
