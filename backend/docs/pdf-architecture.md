# PDF Architecture â€” Recommended Design
## MentorChain

---

## Problem Statement

Two completely independent PDF implementations exist in the codebase:

| Location | What it produces | Tests |
|----------|-----------------|-------|
| `pdf-service/src/ReportGenerator.js` | 5-page production PDF: cover, assessment, careers, psychologist notes, blockchain verification | 30/30 pass |
| `backend/src/jobs/workers.js` `generatePDF()` | Minimal 1-page PDFKit document: student name, narrative, top-5 career titles | None |

The backend worker calls `generatePDF()` directly. The pdf-service is never triggered. Students receive the 1-page stub instead of the production report.

---

## Root Cause

The pdf-service was built as a standalone CLI tool with no HTTP server. The backend had no mechanism to call it, so the workers were written with their own inline PDFKit code as a placeholder. The placeholder was never replaced.

---

## Chosen Architecture: Direct Import (Monorepo Module)

Three strategies were evaluated:

### Option A â€” Direct import âœ… CHOSEN
Copy `pdf-service/src/` into `backend/src/services/pdf/` and import `ReportGenerator` directly in the worker.

**Pros:** No network call, no new container, no latency, no additional Docker service, no serialisation overhead, single deployment unit for the worker, easiest to debug. PDF generation happens in the same Node.js process as the worker.

**Cons:** Worker process memory usage increases by the size of PDFKit and fonts (~15MB). If pdf-service needs updating, both locations must change.

**Why chosen:** The worker is already a separate Bull consumer process. Adding PDFKit memory to it is acceptable. The alternative (HTTP microservice) adds a round-trip, a new port, auth headers, retry logic, and a new container â€” all for a call that only happens once per report generation. The complexity cost exceeds the isolation benefit.

### Option B â€” HTTP microservice
Add Express to pdf-service, call via `axios.post('http://pdf_service:5060/generate', payload)` from the worker.

**Pros:** Language-independent, separately scalable, isolated crashes.

**Cons:** Network latency on every PDF generation, need to serialise/deserialise the entire report payload over HTTP, another container to manage, authentication concerns, much harder to debug.

**Rejected:** The payload (report + assessment + careers + annotations) serialises to ~3KB. The network overhead is unnecessary when both services are Node.js in the same process group.

### Option C â€” Shared npm package
Publish `pdf-service` as a private npm package.

**Pros:** Clean versioning, teams can upgrade independently.

**Cons:** Requires npm registry infrastructure. Overkill for an internal monorepo.

**Rejected:** Adds operational complexity with no benefit over direct import at this scale.

---

## Data Mapper: Backend Model â†’ ReportGenerator Input

The single non-trivial part of the integration is adapting the backend's MongoDB document shapes into the flat objects `ReportGenerator.generate()` expects.

| ReportGenerator expects | Backend source | Notes |
|------------------------|---------------|-------|
| `student.firstName` | `report.userId.firstName` | Direct |
| `student.lastName` | `report.userId.lastName` | Direct |
| `student.email` | `report.userId.email` | Direct |
| `assessment.dimensions[]` | `assessment.scores.{aptitude,interest,...}.score` | Reshape object â†’ array |
| `assessment.overallScore` | `assessment.scores.overall` | Direct |
| `assessment.scores` (flat) | `assessment.aiMetadata` / responses | Reconstruct from stored raw responses |
| `careers[].title` | `report.careerRecommendations[].careerTitle` | Rename |
| `careers[].salary` | `report.careerRecommendations[].salaryRange` | Rename |
| `careers[].topDrivers` | `report.careerRecommendations[].dimensionWeights` | Approximate from stored weights |
| `psychologist.notes[]` | `report.annotations[]` | Reshape `content` â†’ `{ heading, content }` |
| `blockchain.*` | `report.blockchain.*` | Direct |

This mapping lives in one place: `backend/src/services/pdf.service.js`.

---

## Service Communication Flow

```
Assessment scored
      â”‚
      â–¼
Queues.PDF.add('generate-report', {
  assessmentId, userId, recommendations,
  narrative, aiModelVersion
})
      â”‚
      â–¼
[Bull Worker: generate-report]
  createReport() â†’ saves Report doc with status='generating'
  Queues.PDF.add('generate-pdf', { reportId, userId })
      â”‚
      â–¼
[Bull Worker: generate-pdf]
  1. Load Report + populated User + Assessment from MongoDB
  2. pdfService.buildReportData(report, assessment, user)
       â””â”€â”€ Reshapes all fields into ReportGenerator input shape
  3. pdfService.generate(reportData)
       â””â”€â”€ Calls ReportGenerator.generate() â†’ { buffer, hash, pages }
  4. s3Service.upload(buffer, key) â†’ { url, key }
  5. report.markPdfReady({ url, key, sizeBytes, pageCount, sha256Hash })
  6. Queues.NOTIFICATION.add('report-ready', ...)
      â”‚
      â–¼
Student notified. Report status = 'ready'.
      â”‚
      â–¼ (optional, student-initiated)
Queues.BLOCKCHAIN.add('anchor-report', { reportId, hash, userId })
      â”‚
      â–¼
[Bull Worker: anchor-report]
  blockchainService.anchorReport({ reportId, pdfHash, studentId })
  report.confirmBlockchain(...)
  Queues.NOTIFICATION.add('blockchain-confirmed', ...)
```

---

## Files Changed

| File | Change |
|------|--------|
| `backend/src/services/pdf.service.js` | **New** â€” ReportGenerator wrapper + data mapper + S3 upload |
| `backend/src/jobs/workers.js` | Replace `generatePDF()` + `uploadToS3()` with `pdfService.generate()` |
| `pdf-service/src/ReportGenerator.js` | No change â€” used as-is |
| `backend/package.json` | Add `pdfkit` and `qrcode` to dependencies (already present) |

---

## File Copy Step

Before starting the backend, copy the pdf-service source tree into backend:

```
backend/src/services/pdf/
  â”œâ”€â”€ ReportGenerator.js      â† copied from pdf-service/src/ReportGenerator.js
  â”œâ”€â”€ generators/
  â”‚   â”œâ”€â”€ coverPage.js
  â”‚   â”œâ”€â”€ assessmentPage.js
  â”‚   â”œâ”€â”€ careersPage.js
  â”‚   â”œâ”€â”€ psychologistPage.js
  â”‚   â””â”€â”€ blockchainPage.js
  â””â”€â”€ utils/
      â”œâ”€â”€ design.js
      â””â”€â”€ draw.js
```

The `sampleData.js` and `index.js` from pdf-service are not needed in the backend.
`pdfkit` and `qrcode` are already in `backend/package.json`.

