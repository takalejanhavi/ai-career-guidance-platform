'use strict';

const PDFDocument = require('pdfkit');
const crypto      = require('crypto');
const fs          = require('fs');
const path        = require('path');
const { Writable } = require('stream');

const { PAGE, COLORS, FONTS, SPACE } = require('./utils/design');
const draw = require('./utils/draw');
const { renderCoverPage }        = require('./generators/coverPage');
const { renderAssessmentPage }   = require('./generators/assessmentPage');
const { renderCareersPage }      = require('./generators/careersPage');
const { renderPsychologistPage } = require('./generators/psychologistPage');
const { renderBlockchainPage }   = require('./generators/blockchainPage');

/**
 * ReportGenerator
 * ================
 * Orchestrates all page generators into a single multi-page PDF.
 *
 * Usage:
 *   const gen = new ReportGenerator();
 *   const { buffer, hash } = await gen.generate(reportData);
 *   // or
 *   await gen.generateToFile(reportData, './output/report.pdf');
 */
class ReportGenerator {

  constructor(options = {}) {
    this.options = {
      compress: true,
      margins:  { top: 0, bottom: 0, left: 0, right: 0 },
      size:     'A4',
      ...options,
    };
  }

  // ── Generate to Buffer ─────────────────────────────────────────
  async generate(data) {
    const validatedData = this._validate(data);

    return new Promise(async (resolve, reject) => {
      const chunks = [];

      const doc = new PDFDocument({
        ...this.options,
        autoFirstPage: false,
        info: {
          Title:    `${validatedData.report.title} — ${validatedData.student.firstName} ${validatedData.student.lastName}`,
          Author:   validatedData.psychologist?.name || 'CareerAI Platform',
          Subject:  'Career Guidance Report',
          Keywords: 'career guidance, psychometric assessment, AI recommendations',
          Creator:  'CareerAI PDF Service v1.0.0',
          Producer: 'PDFKit',
        },
      });

      doc.on('data',  chunk => chunks.push(chunk));
      doc.on('error', reject);
      let pageCount = 0;
      // Track explicit addPage calls only (not PDFKit's internal continueOnNewPage overflow)
      const origAddPage = doc.addPage.bind(doc);
      doc.addPage = function(...args) {
        pageCount++;
        return origAddPage(...args);
      };

      doc.on('end', async () => {
        const buffer = Buffer.concat(chunks);
        const hash   = _sha256(buffer);
        resolve({ buffer, hash, pages: pageCount });
      });

      try {
        // ── Page 1: Cover ────────────────────────────────────────
        doc.addPage();
        renderCoverPage(doc, validatedData);

        // ── Page 2: Assessment Summary ───────────────────────────
        doc.addPage();
        renderAssessmentPage(doc, validatedData);

        // ── Page 3: Career Recommendations ───────────────────────
        doc.addPage();
        renderCareersPage(doc, validatedData);

        // ── Page 4: Psychologist Notes ────────────────────────────
        if (validatedData.psychologist) {
          doc.addPage();
          renderPsychologistPage(doc, validatedData);
        }

        // ── Page 5: Blockchain Verification ──────────────────────
        if (validatedData.blockchain) {
          doc.addPage();
          await renderBlockchainPage(doc, validatedData);
        }

        doc.end();
      } catch (err) {
        reject(err);
      }
    });
  }

  // ── Generate to File ───────────────────────────────────────────
  async generateToFile(data, outputPath) {
    const { buffer, hash, pages } = await this.generate(data);

    const dir = path.dirname(outputPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    fs.writeFileSync(outputPath, buffer);

    const stat = fs.statSync(outputPath);
    return {
      path:      outputPath,
      hash:      `sha256:${hash}`,
      pages,
      sizeBytes: stat.size,
      sizeKB:    Math.round(stat.size / 1024),
    };
  }

  // ── Validate & normalise input data ───────────────────────────
  _validate(data) {
    if (!data)             throw new Error('Report data is required');
    if (!data.student)     throw new Error('data.student is required');
    if (!data.assessment)  throw new Error('data.assessment is required');
    if (!data.careers?.length) throw new Error('data.careers must be a non-empty array');

    // Ensure report metadata exists
    const now = new Date().toISOString();
    return {
      ...data,
      report: {
        id:          `RPT-${Date.now()}`,
        title:       'Career Guidance Report',
        generatedAt: now,
        platform:    'CareerAI Platform',
        version:     '1.0.0',
        ...(data.report || {}),
      },
      confidence: data.confidence || {
        topCareer:   data.careers[0]?.matchScore / 100 || 0.5,
        gap:         0.1,
        certainty:   'Moderate',
        modelsAgree: true,
        entropy:     1.0,
      },
    };
  }
}

// ── SHA-256 helper ─────────────────────────────────────────────────
function _sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

module.exports = { ReportGenerator };
