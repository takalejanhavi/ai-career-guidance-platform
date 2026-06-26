'use strict';

/**
 * src/index.js
 * Demo entry point — generates a sample report and saves to output/.
 */

const path = require('path');
const { ReportGenerator } = require('./ReportGenerator');
const { SAMPLE_REPORT }   = require('./utils/sampleData');

async function main() {
  console.log('\n╔══════════════════════════════════════════════╗');
  console.log('║   MentorChain PDF Report Generator v1.0.0    ║');
  console.log('╚══════════════════════════════════════════════╝\n');

  const generator  = new ReportGenerator();
  const outputPath = path.join(__dirname, '../output', `career_report_${Date.now()}.pdf`);

  console.log('📋  Generating report for:', `${SAMPLE_REPORT.student.firstName} ${SAMPLE_REPORT.student.lastName}`);
  console.log('    Assessment ID:', SAMPLE_REPORT.assessment.id);
  console.log('    Top career:   ', SAMPLE_REPORT.careers[0].title, `(${SAMPLE_REPORT.careers[0].matchScore}% match)`);
  console.log('    Psychologist: ', SAMPLE_REPORT.psychologist.name);
  console.log('    Blockchain:   ', SAMPLE_REPORT.blockchain.status);
  console.log();

  const t0 = Date.now();

  try {
    const result = await generator.generateToFile(SAMPLE_REPORT, outputPath);
    const elapsed = Date.now() - t0;

    console.log('✅  Report generated successfully!\n');
    console.log('    Path:   ', result.path);
    console.log('    Pages:  ', result.pages);
    console.log('    Size:   ', `${result.sizeKB} KB`);
    console.log('    Hash:   ', result.hash);
    console.log('    Time:   ', `${elapsed}ms`);
    console.log();
  } catch (err) {
    console.error('❌  Generation failed:', err.message);
    console.error(err.stack);
    process.exit(1);
  }
}

main();
