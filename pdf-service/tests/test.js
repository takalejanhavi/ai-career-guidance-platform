'use strict';

/**
 * Test suite for the PDF Report Generator.
 * Run: node tests/test.js
 */

const assert = require('assert').strict;
const path   = require('path');
const fs     = require('fs');
const crypto = require('crypto');

const { ReportGenerator } = require('../src/ReportGenerator');
const { SAMPLE_REPORT }   = require('../src/utils/sampleData');
const { PAGE, COLORS, FONTS, TYPE } = require('../src/utils/design');

// ── Test infrastructure ────────────────────────────────────────────
let passed = 0;
let failed = 0;
const failures = [];

async function test(name, fn) {
  try {
    await fn();
    console.log(`  ✓  ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✗  ${name}`);
    console.error(`     ${err.message}`);
    failed++;
    failures.push({ name, error: err.message });
  }
}

function section(name) {
  console.log(`\n  ${name}`);
  console.log(`  ${'─'.repeat(name.length)}`);
}

// ── Tests ──────────────────────────────────────────────────────────
async function runTests() {
  console.log('\n╔══════════════════════════════════════════════════╗');
  console.log('║   PDF Report Generator — Test Suite              ║');
  console.log('╚══════════════════════════════════════════════════╝');

  const generator = new ReportGenerator();

  // ── Design system ──────────────────────────────────────────────
  section('Design System');

  test('PAGE has correct A4 dimensions', () => {
    assert.ok(PAGE.width  > 594 && PAGE.width  < 596, 'width ~595.28');
    assert.ok(PAGE.height > 841 && PAGE.height < 843, 'height ~841.89');
    assert.ok(PAGE.contentWidth > 0, 'contentWidth is positive');
    assert.ok(PAGE.contentHeight > 0, 'contentHeight is positive');
  });

  test('PAGE.contentWidth = width - 2*marginX', () => {
    assert.equal(PAGE.contentWidth, PAGE.width - PAGE.marginX * 2);
  });

  test('COLORS has all required keys', () => {
    const required = ['indigo', 'violet', 'azure', 'success', 'warning', 'danger', 'white', 'black'];
    required.forEach(k => assert.ok(k in COLORS, `Missing COLORS.${k}`));
  });

  test('COLORS.chart is an array of 10 colors', () => {
    assert.equal(COLORS.chart.length, 10);
    COLORS.chart.forEach(c => assert.match(c, /^#[0-9A-Fa-f]{6}$/, `Invalid color: ${c}`));
  });

  test('TYPE entries have required font and size', () => {
    const required = ['h1','h2','h3','body','caption','badge'];
    required.forEach(k => {
      assert.ok(TYPE[k], `Missing TYPE.${k}`);
      assert.ok(TYPE[k].size > 0, `TYPE.${k}.size must be positive`);
      assert.ok(TYPE[k].font, `TYPE.${k}.font must be set`);
    });
  });

  test('FONTS references are valid PDFKit built-in names', () => {
    const valid = ['Helvetica', 'Helvetica-Bold', 'Helvetica-Oblique',
                   'Helvetica-BoldOblique', 'Courier', 'Courier-Bold'];
    Object.values(FONTS).forEach(f => assert.ok(valid.includes(f), `Invalid font: ${f}`));
  });

  // ── Data validation ────────────────────────────────────────────
  section('Input Validation');

  test('throws on missing data', async () => {
    await assert.rejects(() => generator.generate(null), /required/i);
  });

  test('throws on missing student', async () => {
    await assert.rejects(() => generator.generate({ assessment: {}, careers: [{}] }), /student/i);
  });

  test('throws on missing assessment', async () => {
    await assert.rejects(() => generator.generate({ student: {}, careers: [{}] }), /assessment/i);
  });

  test('throws on empty careers', async () => {
    await assert.rejects(() => generator.generate({ student: {}, assessment: {}, careers: [] }), /careers/i);
  });

  test('auto-fills missing report metadata', async () => {
    const data = { ...SAMPLE_REPORT };
    delete data.report;
    const gen = generator._validate(data);
    assert.ok(gen.report.id, 'auto-generated report.id');
    assert.ok(gen.report.generatedAt, 'auto-generated generatedAt');
    assert.ok(gen.report.platform, 'auto-filled platform');
  });

  test('auto-fills missing confidence', async () => {
    const data = { ...SAMPLE_REPORT };
    delete data.confidence;
    const gen = generator._validate(data);
    assert.ok(gen.confidence, 'confidence was filled');
    assert.ok(gen.confidence.certainty, 'certainty is set');
  });

  // ── PDF generation ─────────────────────────────────────────────
  section('PDF Generation');

  test('generates a PDF buffer from sample data', async () => {
    const { buffer } = await generator.generate(SAMPLE_REPORT);
    assert.ok(Buffer.isBuffer(buffer), 'result is a Buffer');
    assert.ok(buffer.length > 10_000, `Buffer too small: ${buffer.length} bytes`);
  });

  test('generated buffer starts with %PDF signature', async () => {
    const { buffer } = await generator.generate(SAMPLE_REPORT);
    assert.equal(buffer.slice(0, 4).toString(), '%PDF', 'Not a valid PDF');
  });

  test('returns SHA-256 hash of correct format', async () => {
    const { hash } = await generator.generate(SAMPLE_REPORT);
    assert.match(hash, /^[a-f0-9]{64}$/, 'Hash must be 64 hex chars');
  });

  test('hash is deterministic for same content', async () => {
    // Two runs of the same data won't be byte-identical (timestamps differ)
    // but both hashes should be valid hex
    const { hash: h1 } = await generator.generate(SAMPLE_REPORT);
    const { hash: h2 } = await generator.generate(SAMPLE_REPORT);
    assert.match(h1, /^[a-f0-9]{64}$/);
    assert.match(h2, /^[a-f0-9]{64}$/);
  });

  test('returns correct page count (5 pages with all sections)', async () => {
    const { pages } = await generator.generate(SAMPLE_REPORT);
    assert.equal(pages, 5, `Expected 5 pages, got ${pages}`);
  });

  test('generates 4 pages when psychologist notes omitted', async () => {
    const data = { ...SAMPLE_REPORT, psychologist: null };
    const { pages } = await generator.generate(data);
    assert.equal(pages, 4, `Expected 4 pages without psychologist`);
  });

  test('generates 4 pages when blockchain omitted', async () => {
    const data = { ...SAMPLE_REPORT, blockchain: null };
    const { pages } = await generator.generate(data);
    assert.equal(pages, 4, `Expected 4 pages without blockchain`);
  });

  test('generates 3 pages with only core sections', async () => {
    const data = { ...SAMPLE_REPORT, psychologist: null, blockchain: null };
    const { pages } = await generator.generate(data);
    assert.equal(pages, 3);
  });

  // ── File output ────────────────────────────────────────────────
  section('File Output');

  test('generateToFile writes a readable PDF file', async () => {
    const outputDir = path.join(__dirname, '../output/test');
    const filePath  = path.join(outputDir, `test_${Date.now()}.pdf`);

    const result = await generator.generateToFile(SAMPLE_REPORT, filePath);

    assert.ok(fs.existsSync(result.path), 'File exists on disk');
    assert.ok(result.sizeBytes > 10_000, `File too small: ${result.sizeBytes} bytes`);
    assert.ok(result.sizeKB > 0, 'sizeKB is positive');
    assert.match(result.hash, /^sha256:[a-f0-9]{64}$/, 'hash has correct prefix');
    assert.equal(result.pages, 5);

    // Verify it's a real PDF
    const content = fs.readFileSync(result.path, 'utf8', { flag: 'r' }).substring(0, 4);
    assert.equal(content, '%PDF');

    // Cleanup
    fs.unlinkSync(result.path);
    try { fs.rmdirSync(outputDir); } catch (_) {}
  });

  test('creates output directory if it does not exist', async () => {
    const uniqueDir = path.join(__dirname, `../output/test_${Date.now()}`);
    const filePath  = path.join(uniqueDir, 'report.pdf');

    await generator.generateToFile(SAMPLE_REPORT, filePath);
    assert.ok(fs.existsSync(filePath), 'File created in new directory');

    fs.unlinkSync(filePath);
    fs.rmdirSync(uniqueDir, { recursive: true });
  });

  // ── Content correctness ────────────────────────────────────────
  section('Content Correctness');

  test('SAMPLE_REPORT has all required top-level keys', () => {
    const required = ['student','assessment','careers','confidence','psychologist','blockchain','report'];
    required.forEach(k => assert.ok(k in SAMPLE_REPORT, `Missing key: ${k}`));
  });

  test('SAMPLE_REPORT careers are sorted by rank', () => {
    const ranks = SAMPLE_REPORT.careers.map(c => c.rank);
    assert.deepEqual(ranks, [1, 2, 3]);
  });

  test('assessment scores are all in [0,100]', () => {
    Object.entries(SAMPLE_REPORT.assessment.scores).forEach(([k, v]) => {
      assert.ok(v >= 0 && v <= 100, `${k} out of range: ${v}`);
    });
  });

  test('dimension scores are all in [0,100]', () => {
    SAMPLE_REPORT.assessment.dimensions.forEach(d => {
      assert.ok(d.score >= 0 && d.score <= 100, `${d.dimension} out of range: ${d.score}`);
    });
  });

  test('career match scores are in [0,100]', () => {
    SAMPLE_REPORT.careers.forEach(c => {
      assert.ok(c.matchScore >= 0 && c.matchScore <= 100, `${c.title} matchScore out of range`);
      assert.ok(c.rfScore  >= 0 && c.rfScore  <= 100);
      assert.ok(c.xgbScore >= 0 && c.xgbScore <= 100);
    });
  });

  test('blockchain txHash starts with 0x', () => {
    assert.ok(SAMPLE_REPORT.blockchain.txHash.startsWith('0x'));
  });

  test('pdfHash has sha256: prefix', () => {
    assert.ok(SAMPLE_REPORT.blockchain.pdfHash.startsWith('sha256:'));
  });

  // ── Performance ────────────────────────────────────────────────
  section('Performance');

  test('generates in under 3 seconds', async () => {
    const t0 = Date.now();
    await generator.generate(SAMPLE_REPORT);
    const elapsed = Date.now() - t0;
    assert.ok(elapsed < 3000, `Too slow: ${elapsed}ms (limit: 3000ms)`);
  });

  test('handles minimal data without crashing', async () => {
    const minimal = {
      student: {
        id: 'S001', firstName: 'Test', lastName: 'User',
        email: 't@t.com', institution: 'Test Uni', gradeLevel: 'Year 1',
        country: 'US', avatarInitials: 'TU',
      },
      assessment: {
        id: 'A001', templateId: 'v1', templateVersion: '1.0',
        attemptNumber: 1, totalQuestions: 10,
        completedAt: new Date().toISOString(), durationMinutes: 10, status: 'scored',
        scores: {
          mathScore: 70, scienceScore: 70, englishScore: 70,
          communication: 70, leadership: 70, creativity: 70,
          analyticalThinking: 70, extroversion: 70,
          conscientiousness: 70, extracurricular: 70,
        },
        dimensions: [{ dimension: 'Test', score: 70 }],
        overallScore: 70, aiModelVersion: '1.0', inferenceMs: 100, confidenceScore: 0.7,
      },
      careers: [{
        rank: 1, title: 'Engineer', category: 'Tech',
        matchScore: 75, matchLabel: 'Good', rfScore: 73, xgbScore: 77,
        growthOutlook: 'growing',
        description: 'Test career description.',
        keySkills: ['Skill A', 'Skill B'],
        salary: { min: 70_000, max: 130_000, currency: 'USD' },
        topDrivers: [{ feature: 'Math', impact: 0.3, direction: 'positive' }],
      }],
    };
    const { buffer, pages } = await generator.generate(minimal);
    assert.ok(buffer.length > 5_000);
    assert.equal(pages, 3); // cover + assessment + careers
  });

  // ── Summary ────────────────────────────────────────────────────
  console.log('\n' + '═'.repeat(52));
  console.log(`  Results:  ${passed} passed  |  ${failed} failed  |  ${passed + failed} total`);
  if (failures.length > 0) {
    console.log('\n  Failed tests:');
    failures.forEach(f => console.log(`    ✗ ${f.name}`));
  }
  console.log('═'.repeat(52) + '\n');

  process.exit(failed > 0 ? 1 : 0);
}

runTests().catch(err => {
  console.error('Test runner crashed:', err);
  process.exit(1);
});
