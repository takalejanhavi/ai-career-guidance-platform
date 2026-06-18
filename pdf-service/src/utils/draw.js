'use strict';

const { COLORS, FONTS, TYPE, RADIUS, CHART } = require('./design');

/**
 * PDFKit drawing primitives.
 * Every function receives `doc` as first arg and returns void.
 * Coordinate system: (x, y) = top-left corner.
 */

// ── Geometry helpers ──────────────────────────────────────────────

/** Draw a rounded rectangle path (does not fill/stroke — call after). */
function roundedRect(doc, x, y, w, h, r = RADIUS.md) {
  r = Math.min(r, w / 2, h / 2);
  doc.roundedRect(x, y, w, h, r);
}

/** Filled rounded rectangle with optional border. */
function filledRect(doc, x, y, w, h, {
  fill   = COLORS.white,
  stroke = null,
  strokeW = 0.5,
  radius  = RADIUS.md,
} = {}) {
  doc.save();
  roundedRect(doc, x, y, w, h, radius);
  if (fill)   doc.fill(fill);
  if (stroke) {
    roundedRect(doc, x, y, w, h, radius);
    doc.lineWidth(strokeW).stroke(stroke);
  }
  doc.restore();
}

/** Drop-shadow simulation: slightly offset filled rect in translucent color. */
function cardShadow(doc, x, y, w, h, radius = RADIUS.lg) {
  filledRect(doc, x + 1, y + 2, w, h, { fill: '#00000010', radius });
}

/** Full card with shadow + white background + border. */
function card(doc, x, y, w, h, {
  fill   = COLORS.white,
  border = COLORS.gray100,
  radius = RADIUS.lg,
  shadow = true,
} = {}) {
  if (shadow) cardShadow(doc, x, y, w, h, radius);
  filledRect(doc, x, y, w, h, { fill, stroke: border, strokeW: 0.75, radius });
}

/** Thin horizontal rule. */
function rule(doc, x, y, w, color = COLORS.gray100, thickness = 0.5) {
  doc.save()
    .moveTo(x, y)
    .lineTo(x + w, y)
    .lineWidth(thickness)
    .stroke(color)
    .restore();
}

/** Vertical accent bar (left edge of section heading). */
function accentBar(doc, x, y, h, color = COLORS.indigo, w = 4) {
  filledRect(doc, x, y, w, h, { fill: color, radius: 2 });
}

// ── Typography helpers ────────────────────────────────────────────

/**
 * Set doc font/size from a TYPE entry.
 * Returns the entry so callers can chain .leading etc.
 */
function applyType(doc, typeEntry) {
  doc.font(typeEntry.font).fontSize(typeEntry.size);
  return typeEntry;
}

/**
 * Draw text using a TYPE entry.
 * opts are passed to doc.text().
 */
function drawText(doc, text, x, y, typeEntry, {
  color   = COLORS.black,
  opts    = {},
  width   = null,
} = {}) {
  doc.save();
  applyType(doc, typeEntry);
  doc.fillColor(color);
  const textOpts = { ...opts };
  if (width !== null) textOpts.width = width;
  doc.text(String(text), x, y, textOpts);
  doc.restore();
}

// ── Badge ─────────────────────────────────────────────────────────

/**
 * Pill badge.
 * Returns the width of the drawn badge.
 */
function badge(doc, text, x, y, {
  bg      = COLORS.indigo,
  textClr = COLORS.white,
  paddingX = 8,
  paddingY = 4,
  radius   = RADIUS.pill,
} = {}) {
  doc.save();
  doc.font(FONTS.bold).fontSize(7);
  const textW   = doc.widthOfString(String(text));
  const badgeW  = textW + paddingX * 2;
  const badgeH  = 14;
  filledRect(doc, x, y, badgeW, badgeH, { fill: bg, radius });
  doc.fillColor(textClr)
    .text(String(text), x + paddingX, y + paddingY, { lineBreak: false });
  doc.restore();
  return badgeW;
}

/**
 * Semantic status badge (success / warning / danger / info / default).
 */
function statusBadge(doc, text, x, y, variant = 'default') {
  const map = {
    success: { bg: COLORS.successLight, text: '#065F46' },
    warning: { bg: COLORS.warningLight, text: '#92400E' },
    danger:  { bg: COLORS.dangerLight,  text: '#991B1B' },
    info:    { bg: COLORS.infoLight,    text: '#0E7490' },
    indigo:  { bg: '#EEF2FF',           text: '#3730A3' },
    violet:  { bg: '#F5F3FF',           text: '#5B21B6' },
    default: { bg: COLORS.gray100,      text: COLORS.gray600 },
  };
  const style = map[variant] || map.default;
  return badge(doc, text, x, y, { bg: style.bg, textClr: style.text });
}

// ── Progress / confidence bar ─────────────────────────────────────

/**
 * Horizontal progress bar.
 * @param {number} value  0–100
 */
function progressBar(doc, x, y, w, value, {
  trackColor = COLORS.gray100,
  fillColor  = COLORS.indigo,
  height     = CHART.confidenceBar.trackH,
  radius     = CHART.confidenceBar.radius,
  animated   = false,   // no-op in PDF, here for API parity
} = {}) {
  const pct     = Math.max(0, Math.min(100, value)) / 100;
  const fillW   = Math.max(pct * w, pct > 0 ? radius * 2 : 0);

  // Track
  filledRect(doc, x, y, w, height, { fill: trackColor, radius });
  // Fill
  if (fillW > 0) {
    filledRect(doc, x, y, fillW, height, { fill: fillColor, radius });
  }
}

/**
 * Labeled confidence row:
 *   Label                    [bar=========    ] 78%
 */
function confidenceRow(doc, x, y, w, label, value, color = COLORS.indigo) {
  const barX  = x + 160;
  const barW  = w - 160 - 40;
  const barY  = y + 4;

  // Label
  drawText(doc, label, x, y, TYPE.body, { color: COLORS.gray800 });

  // Bar
  progressBar(doc, barX, barY, barW, value, { fillColor: color, height: 7 });

  // Value
  doc.save()
    .font(FONTS.bold)
    .fontSize(9)
    .fillColor(color)
    .text(`${Math.round(value)}%`, barX + barW + 6, y, { lineBreak: false })
    .restore();

  return y + 18;
}

// ── Radar chart (pure PDFKit geometry) ───────────────────────────

/**
 * Draws a complete radar / spider chart.
 *
 * @param {Array<{dimension:string, score:number}>} data   scores 0–100
 * @param {number} cx   centre X
 * @param {number} cy   centre Y
 * @param {number} r    outer radius
 */
function radarChart(doc, data, cx, cy, r = CHART.radarRadius) {
  const n      = data.length;
  const levels = CHART.radarLevels;
  const angleStep = (Math.PI * 2) / n;
  const startAngle = -Math.PI / 2;

  // Helper: polar to Cartesian
  const toXY = (i, frac) => ({
    x: cx + Math.cos(startAngle + i * angleStep) * r * frac,
    y: cy + Math.sin(startAngle + i * angleStep) * r * frac,
  });

  doc.save();

  // ── Grid levels ───────────────────────────────────────────────
  for (let lvl = 1; lvl <= levels; lvl++) {
    const frac = lvl / levels;
    doc.save();
    doc.moveTo(toXY(0, frac).x, toXY(0, frac).y);
    for (let i = 1; i < n; i++) {
      const p = toXY(i, frac);
      doc.lineTo(p.x, p.y);
    }
    doc.closePath()
      .lineWidth(0.5)
      .stroke(lvl === levels ? COLORS.gray200 : COLORS.gray100);
    doc.restore();

    // Level label (rightmost axis)
    if (lvl > 0) {
      const labelPt = toXY(1, frac);
      doc.save()
        .font(FONTS.regular)
        .fontSize(6)
        .fillColor(COLORS.gray400)
        .text(`${lvl * 20}`, labelPt.x + 2, labelPt.y - 4, { lineBreak: false })
        .restore();
    }
  }

  // ── Axis lines ────────────────────────────────────────────────
  for (let i = 0; i < n; i++) {
    const outer = toXY(i, 1);
    doc.save()
      .moveTo(cx, cy)
      .lineTo(outer.x, outer.y)
      .lineWidth(0.5)
      .stroke(COLORS.gray200)
      .restore();
  }

  // ── Data polygon ──────────────────────────────────────────────
  const pts = data.map((d, i) => toXY(i, d.score / 100));

  // Filled area (translucent)
  doc.save();
  doc.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) doc.lineTo(pts[i].x, pts[i].y);
  doc.closePath()
    .fillOpacity(0.18)
    .fill(COLORS.indigo);
  doc.restore();

  // Outline
  doc.save();
  doc.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) doc.lineTo(pts[i].x, pts[i].y);
  doc.closePath()
    .lineWidth(1.5)
    .stroke(COLORS.indigo);
  doc.restore();

  // Data point dots
  pts.forEach(p => {
    doc.save()
      .circle(p.x, p.y, 3)
      .fill(COLORS.white);
    doc.circle(p.x, p.y, 3)
      .lineWidth(1.5)
      .stroke(COLORS.indigo);
    doc.restore();
  });

  // ── Axis labels ───────────────────────────────────────────────
  data.forEach((d, i) => {
    const outer  = toXY(i, 1.22);
    const label  = d.dimension;
    const score  = d.score;
    const isLeft = outer.x < cx - 5;
    const align  = isLeft ? 'right' : 'left';

    doc.save()
      .font(FONTS.bold)
      .fontSize(8)
      .fillColor(COLORS.gray800)
      .text(label, outer.x - (isLeft ? 60 : 0), outer.y - 10, {
        width: 60, align, lineBreak: false,
      })
      .restore();

    doc.save()
      .font(FONTS.bold)
      .fontSize(8)
      .fillColor(COLORS.indigo)
      .text(`${score}`, outer.x - (isLeft ? 60 : 0), outer.y + 2, {
        width: 60, align, lineBreak: false,
      })
      .restore();
  });

  doc.restore();
}

// ── Bar chart (horizontal) ────────────────────────────────────────

/**
 * Horizontal grouped bar chart for career confidence scores.
 * @param {Array<{label:string, rf:number, xgb:number, ensemble:number}>} data
 */
function barChart(doc, data, x, y, w) {
  const barH   = CHART.barHeight;
  const gap    = CHART.barGap;
  const groupH = barH * 3 + gap * 2 + 20;  // 3 bars + 2 inter-bar gaps + group spacing
  let curY = y;

  // Legend
  const legend = [
    { label: 'Ensemble', color: COLORS.indigo },
    { label: 'Random Forest', color: COLORS.violet },
    { label: 'XGBoost', color: COLORS.azure },
  ];
  let lx = x;
  legend.forEach(l => {
    filledRect(doc, lx, curY, 10, 8, { fill: l.color, radius: 2 });
    doc.save()
      .font(FONTS.regular).fontSize(7.5).fillColor(COLORS.gray600)
      .text(l.label, lx + 14, curY + 0.5, { lineBreak: false })
      .restore();
    lx += doc.widthOfString(l.label) + 28;
  });
  curY += 18;

  data.forEach((item, idx) => {
    // Career label
    doc.save()
      .font(FONTS.bold).fontSize(8.5).fillColor(COLORS.gray800)
      .text(item.label, x, curY, { width: 140, lineBreak: false })
      .restore();

    const barX = x + 148;
    const barW = w - 148;

    // Track + bars for ensemble / RF / XGB
    [
      { val: item.ensemble, color: COLORS.indigo },
      { val: item.rf,       color: COLORS.violet },
      { val: item.xgb,      color: COLORS.azure  },
    ].forEach((bar, bi) => {
      const by = curY + bi * (barH + gap);
      // Track
      filledRect(doc, barX, by, barW, barH, { fill: COLORS.gray100, radius: CHART.barRadius });
      // Fill
      const fillW = Math.max((bar.val / 100) * barW, barH);
      filledRect(doc, barX, by, fillW, barH, { fill: bar.color, radius: CHART.barRadius });
      // Value
      doc.save()
        .font(FONTS.bold).fontSize(7.5).fillColor(bar.color)
        .text(`${Math.round(bar.val)}%`, barX + fillW + 4, by + 2, { lineBreak: false })
        .restore();
    });

    curY += groupH;

    // Divider between items (not after last)
    if (idx < data.length - 1) {
      rule(doc, x, curY - 6, w);
    }
  });

  return curY;
}

// ── QR code placeholder ───────────────────────────────────────────

/** Draw a placeholder QR frame if image buffer unavailable. */
function qrPlaceholder(doc, x, y, size = 72) {
  filledRect(doc, x, y, size, size, { fill: COLORS.white, stroke: COLORS.gray200, radius: 4 });
  doc.save()
    .font(FONTS.regular).fontSize(6).fillColor(COLORS.gray400)
    .text('QR CODE', x, y + size / 2 - 3, { width: size, align: 'center', lineBreak: false })
    .restore();
}

// ── Key-value pair row ────────────────────────────────────────────

/** Renders a "Key:  Value" pair with optional divider. */
function kvRow(doc, x, y, w, key, value, {
  keyColor   = COLORS.gray600,
  valueColor = COLORS.gray800,
  divider    = false,
  mono       = false,
} = {}) {
  const vFont = mono ? FONTS.mono : FONTS.regular;
  doc.save()
    .font(FONTS.bold).fontSize(8.5).fillColor(keyColor)
    .text(key, x, y, { lineBreak: false })
    .restore();

  doc.save()
    .font(vFont).fontSize(8.5).fillColor(valueColor)
    .text(value, x + 120, y, { width: w - 120, lineBreak: false })
    .restore();

  if (divider) rule(doc, x, y + 16, w, COLORS.gray100);
  return y + (divider ? 20 : 16);
}

// ── Section heading ───────────────────────────────────────────────

/**
 * Draws a section heading with left accent bar and optional badge.
 * Returns the Y after the heading (ready for content).
 */
function sectionHeading(doc, x, y, title, {
  color     = COLORS.indigo,
  badgeText = null,
  badgeVar  = 'indigo',
  icon      = null,   // placeholder for future icon support
} = {}) {
  const barH = 22;
  accentBar(doc, x, y, barH, color, 4);

  doc.save()
    .font(FONTS.bold).fontSize(13).fillColor(COLORS.gray800)
    .text(title, x + 12, y + 3, { lineBreak: false })
    .restore();

  if (badgeText) {
    const titleW = doc.font(FONTS.bold).fontSize(13).widthOfString(title);
    statusBadge(doc, badgeText, x + 12 + titleW + 10, y + 5, badgeVar);
  }

  return y + barH + 10;
}

module.exports = {
  roundedRect, filledRect, cardShadow, card, rule, accentBar,
  applyType, drawText,
  badge, statusBadge,
  progressBar, confidenceRow,
  radarChart, barChart,
  qrPlaceholder, kvRow,
  sectionHeading,
};
