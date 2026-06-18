'use strict';

/**
 * pdf-service/src/api/server.js
 * ==============================
 * Lightweight Express HTTP API wrapping ReportGenerator.
 *
 * This file is NOT used by the current architecture (direct import).
 * It is provided so the pdf-service can be switched to HTTP microservice
 * mode in the future by simply running: node src/api/server.js
 *
 * The backend would then call:
 *   POST http://pdf_service:5060/generate
 *   body: { report, assessment, careers, confidence, psychologist, blockchain }
 *
 * Current mode: pdf.service.js imports ReportGenerator directly.
 * Future mode:  add PDF_SERVICE_URL env var and switch pdf.service.js
 *               to call this endpoint instead.
 */

require('dotenv').config();

const express = require('express');
const crypto  = require('crypto');
const { ReportGenerator } = require('../ReportGenerator');

const PORT       = process.env.PORT || 5060;
const API_SECRET = process.env.PDF_SERVICE_SECRET || '';

// ── Auth guard ────────────────────────────────────────────────────────────────
function authGuard(req, res, next) {
  if (!API_SECRET) return next();
  const token = req.headers['x-internal-token'] || req.headers['x-api-key'];
  if (token !== API_SECRET) {
    return res.status(401).json({ success: false, error: 'Unauthorised' });
  }
  next();
}

// ── App ───────────────────────────────────────────────────────────────────────
const app = express();
app.use(express.json({ limit: '2mb' }));

// ── Health ────────────────────────────────────────────────────────────────────
app.get('/healthz', (req, res) => {
  res.json({ status: 'ok', service: 'pdf-service', version: '1.0.0' });
});

/**
 * POST /generate
 *
 * Accepts the full ReportGenerator input payload and returns a JSON body
 * containing the PDF as a base64 string plus metadata.
 *
 * Request body: ReportGenerator input (student, assessment, careers, ...)
 *
 * Response:
 * {
 *   success: true,
 *   pdf:     "<base64-encoded PDF>",
 *   hash:    "<64-char sha256 hex>",
 *   pages:   <number>,
 *   sizeBytes: <number>
 * }
 */
app.post('/generate', authGuard, async (req, res) => {
  const t0 = Date.now();

  if (!req.body?.student || !req.body?.assessment || !req.body?.careers?.length) {
    return res.status(400).json({
      success: false,
      error: 'Request body must include student, assessment, and careers[]',
    });
  }

  try {
    const generator = new ReportGenerator();
    const { buffer, hash, pages } = await generator.generate(req.body);

    res.json({
      success  : true,
      pdf      : buffer.toString('base64'),
      hash,
      pages,
      sizeBytes: buffer.length,
      elapsedMs: Date.now() - t0,
    });
  } catch (err) {
    console.error('[PDF API] Generation failed:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /generate/stream
 *
 * Same as /generate but streams the raw PDF bytes.
 * Content-Type: application/pdf
 * X-PDF-Hash: <sha256 hex>
 * X-PDF-Pages: <number>
 */
app.post('/generate/stream', authGuard, async (req, res) => {
  if (!req.body?.student || !req.body?.assessment || !req.body?.careers?.length) {
    return res.status(400).json({ success: false, error: 'Invalid payload' });
  }

  try {
    const generator = new ReportGenerator();
    const { buffer, hash, pages } = await generator.generate(req.body);

    res.set({
      'Content-Type'       : 'application/pdf',
      'Content-Disposition': 'inline; filename="career-report.pdf"',
      'Content-Length'     : buffer.length,
      'X-PDF-Hash'         : hash,
      'X-PDF-Pages'        : String(pages),
    });
    res.send(buffer);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── 404 ────────────────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ success: false, error: `${req.method} ${req.path} not found` });
});

// ── Start ──────────────────────────────────────────────────────────────────────
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`\n  PDF service listening on port ${PORT}`);
    console.log(`  Auth: ${API_SECRET ? 'enabled' : 'disabled (set PDF_SERVICE_SECRET)'}\n`);
  });
}

module.exports = { app };
