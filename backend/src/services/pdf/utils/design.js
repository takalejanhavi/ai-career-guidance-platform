'use strict';

/**
 * PDF Design System
 * ==================
 * Single source of truth for all visual properties.
 * All measurements in PDF points (1 pt = 1/72 inch).
 * A4 page: 595.28 × 841.89 pt
 */

// ── Page geometry ─────────────────────────────────────────────────
const PAGE = {
  width:    595.28,
  height:   841.89,
  marginX:  48,
  marginY:  48,
  get contentWidth()  { return this.width  - this.marginX * 2; },
  get contentHeight() { return this.height - this.marginY * 2; },
  get right()  { return this.width  - this.marginX; },
  get bottom() { return this.height - this.marginY; },
};

// ── Brand colour palette ──────────────────────────────────────────
const COLORS = {
  // Primaries
  indigo:       '#6366F1',
  indigoLight:  '#818CF8',
  indigoDark:   '#4338CA',
  violet:       '#8B5CF6',
  azure:        '#3B82F6',

  // Gradient simulation (flat PDF approximation)
  gradStart:    '#6366F1',
  gradMid:      '#7C3AED',
  gradEnd:      '#3B82F6',

  // Neutrals
  white:        '#FFFFFF',
  offWhite:     '#F8FAFC',
  gray50:       '#F1F5F9',
  gray100:      '#E2E8F0',
  gray200:      '#CBD5E1',
  gray400:      '#94A3B8',
  gray600:      '#475569',
  gray800:      '#1E293B',
  black:        '#0F172A',

  // Semantic
  success:      '#10B981',
  successLight: '#D1FAE5',
  warning:      '#F59E0B',
  warningLight: '#FEF3C7',
  danger:       '#EF4444',
  dangerLight:  '#FEE2E2',
  info:         '#06B6D4',
  infoLight:    '#CFFAFE',

  // Chart colours (for bars, radar, etc.)
  chart: ['#6366F1', '#8B5CF6', '#3B82F6', '#10B981', '#F59E0B',
          '#EF4444', '#06B6D4', '#EC4899', '#14B8A6', '#F97316'],

  // Section accent strip colours
  sectionAccents: {
    summary:        '#6366F1',
    careers:        '#8B5CF6',
    radar:          '#3B82F6',
    psychologist:   '#10B981',
    blockchain:     '#F59E0B',
  },
};

// ── Typography ────────────────────────────────────────────────────
const FONTS = {
  // PDFKit built-in fonts (no file needed)
  regular:      'Helvetica',
  bold:         'Helvetica-Bold',
  italic:       'Helvetica-Oblique',
  boldItalic:   'Helvetica-BoldOblique',
  mono:         'Courier',
  monoBold:     'Courier-Bold',
};

const TYPE = {
  // Display sizes
  display1:   { size: 28, font: FONTS.bold,    leading: 34 },
  display2:   { size: 22, font: FONTS.bold,    leading: 28 },
  // Heading sizes
  h1:         { size: 18, font: FONTS.bold,    leading: 24 },
  h2:         { size: 14, font: FONTS.bold,    leading: 20 },
  h3:         { size: 12, font: FONTS.bold,    leading: 16 },
  h4:         { size: 10, font: FONTS.bold,    leading: 14 },
  // Body
  body:       { size: 10, font: FONTS.regular, leading: 15 },
  bodyBold:   { size: 10, font: FONTS.bold,    leading: 15 },
  bodySmall:  { size:  9, font: FONTS.regular, leading: 13 },
  caption:    { size:  8, font: FONTS.regular, leading: 12, color: COLORS.gray600 },
  label:      { size:  8, font: FONTS.bold,    leading: 12, color: COLORS.gray600 },
  mono:       { size:  8, font: FONTS.mono,    leading: 12 },
  monoBold:   { size:  8, font: FONTS.monoBold,leading: 12 },
  // Special
  badge:      { size:  7, font: FONTS.bold,    leading: 11 },
  hero:       { size: 32, font: FONTS.bold,    leading: 38 },
};

// ── Spacing ───────────────────────────────────────────────────────
const SPACE = {
  xs:   4,
  sm:   8,
  md:   16,
  lg:   24,
  xl:   32,
  xxl:  48,
  section: 36,
};

// ── Radius ────────────────────────────────────────────────────────
const RADIUS = {
  sm:   4,
  md:   8,
  lg:   12,
  xl:   16,
  pill: 999,
};

// ── Shadows (simulated via filled rect offsets) ───────────────────
const SHADOW = {
  card:  { dx: 0, dy: 2, color: '#00000012' },
};

// ── Chart dimensions ──────────────────────────────────────────────
const CHART = {
  barHeight:      14,
  barGap:         10,
  barRadius:      4,
  barTrackColor:  COLORS.gray100,
  radarRadius:    90,
  radarLevels:    5,
  radarPadding:   20,
  confidenceBar: {
    height:  16,
    trackH:  6,
    radius:  3,
  },
};

module.exports = { PAGE, COLORS, FONTS, TYPE, SPACE, RADIUS, SHADOW, CHART };
