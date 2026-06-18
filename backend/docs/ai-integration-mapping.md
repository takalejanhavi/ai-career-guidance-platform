# AI Integration Fix — Mapping Strategy
## CareerAI Platform

---

## Decision: Adapter in the Backend, Zero AI Service Changes

Three mismatches were identified:

| # | Mismatch | Backend (current) | AI Service (actual) |
|---|----------|-------------------|---------------------|
| 1 | Endpoint | `POST /recommend` | `POST /predict`, `/predict/explain` |
| 2 | Request shape | `{ featureVector: number[5], responses }` | `{ math_score, science_score, ..., top_n }` (10 named raw features) |
| 3 | Response shape | expects `{ scores, recommendations, narrative, modelVersion, confidence }` | returns `{ top_careers, confidence, model_info, input, engineered_features }` |

**Chosen fix: rewrite the backend's request builder and response adapter. The AI service is unchanged.**

### Why not change the AI service?

The AI service is fully tested (46/46 tests), its model is trained and serialized, and its `/predict/explain` endpoint already returns everything the PDF needs (`top_drivers`, `engineered_features`, `confidence_summary`). Adding a `/recommend` endpoint would mean either duplicating the prediction logic or wrapping `/predict/explain` anyway — at which point the wrapper might as well live in the backend, where it has direct access to the `Assessment` and `Report` Mongoose models it needs to populate.

### Why not change the response shape the rest of the backend expects?

`report.service.js`, `pdf.service.js`, and the frontend `ReportPage` all consume `report.careerRecommendations[]` and `assessment.scores.{aptitude,interest,personality,values,learningStyle,overall}`. These shapes are well-tested and used across 5+ files. Changing them would cascade through the PDF mapper (already verified end-to-end with a real generated PDF) and the frontend.

**Conclusion:** one new file (`assessment.aiClient.js`) becomes the single seam between the two systems. Everything upstream and downstream of it keeps its existing shape.

---

## Mapping Table 1 — Request: Assessment Responses → AI `/predict/explain` Input

The AI service expects 10 raw features (0-100 scale): `math_score, science_score, english_score, communication, leadership, creativity, analytical_thinking, extroversion, conscientiousness, extracurricular`.

The assessment question bank has 5 sections (29 questions): `aptitude` (5), `interest` (7), `personality` (6), `values` (6), `learning_style` (5). Each response carries a `rawScore` (0–10) and a `section`.

A single assessment section maps to **multiple** AI raw features — e.g. `aptitude` responses inform both `math_score` and `analytical_thinking`. The mapping below was derived from the semantic content of each question tag (stored in `question_bank.json` as `traits: []`) and the AI service's own `_feat_description()` text.

| AI raw feature | Source section(s) | Formula |
|---|---|---|
| `math_score` | `aptitude` (questions tagged `numerical`/`math`) | mean(rawScore) × 10 of aptitude questions tagged `math` |
| `science_score` | `aptitude` (questions tagged `science`/`logical`) | mean(rawScore) × 10 of aptitude questions tagged `science` |
| `english_score` | `interest` (questions tagged `verbal`/`language`) | mean(rawScore) × 10 of interest questions tagged `verbal` |
| `communication` | `personality` (tagged `communication`) | mean(rawScore) × 10 |
| `leadership` | `values` (tagged `leadership`) | mean(rawScore) × 10 |
| `creativity` | `interest` (tagged `creative`) | mean(rawScore) × 10 |
| `analytical_thinking` | `aptitude` (all) | mean(rawScore) × 10 of all aptitude questions |
| `extroversion` | `personality` (tagged `extroversion`) | mean(rawScore) × 10 |
| `conscientiousness` | `values` (tagged `conscientiousness`) | mean(rawScore) × 10 |
| `extracurricular` | `learning_style` (all) | mean(rawScore) × 10 |

**Fallback:** if a question's `traits` array is missing or no question in a section matches a given trait, fall back to the **section average** (× 10) for every AI feature mapped to that section. This guarantees a complete 10-feature vector even with the current 29-question bank, where not every question has explicit trait tags yet.

---

## Mapping Table 2 — Response: AI `/predict/explain` Output → Backend Pipeline

### 2a. `assessment.scores.*` (dimension scores, 0-100, with tier)

The AI service has **no concept** of the 5 psychometric dimensions (`aptitude`, `interest`, `personality`, `values`, `learningStyle`) — it only outputs career-level confidence. These dimension scores must therefore be computed **independently, in the backend**, directly from the raw assessment responses (the same data already used to build the AI feature vector) — not derived from the AI response.

| Backend field | Source | Formula |
|---|---|---|
| `scores.aptitude.score` | `aptitude` section responses | mean(rawScore) × 10, rounded |
| `scores.interest.score` | `interest` section responses | mean(rawScore) × 10, rounded |
| `scores.personality.score` | `personality` section responses | mean(rawScore) × 10, rounded |
| `scores.values.score` | `values` section responses | mean(rawScore) × 10, rounded |
| `scores.learningStyle.score` | `learning_style` section responses | mean(rawScore) × 10, rounded |
| `scores.*.tier` | derived from score | `<50`→`low`, `50-69`→`moderate`, `70-84`→`high`, `≥85`→`very_high` |
| `scores.*.percentile` | derived from score | `min(99, round(score * 1.05))` (approximation; replace with cohort percentile when historical data exists) |
| `scores.overall` | weighted mean of the 5 dimension scores | `round(mean(all 5 scores))` |

### 2b. `recommendations[]` (→ `report.careerRecommendations[]`)

| Backend field | AI `/predict/explain` source |
|---|---|
| `careerSlug` | `slugify(top_careers[i].career)` |
| `careerTitle` | `top_careers[i].career` |
| `category` | derived from `CAREER_NARRATIVES` lookup (already in `predict.py`, exposed via `description`/`growth_outlook` only — category inferred client-side via a static map, see DTO file) |
| `matchScore` | `top_careers[i].confidence_pct` (already 0-100) |
| `matchLabel` | `top_careers[i].confidence_tier` lower-cased: `Very High`→`excellent`, `High`→`excellent`, `Moderate`→`good`, `Low`→`fair` |
| `description` | `top_careers[i].description` |
| `keySkills` | `top_careers[i].key_traits` |
| `growthOutlook` | `top_careers[i].growth_outlook` (already matches enum: `declining/stable/growing/high_growth`) |
| `salaryRange.min` / `.max` | `top_careers[i].salary_range[0]` / `[1]` |
| `salaryRange.currency` | `'USD'` (constant — AI service salary data is USD only) |
| `dimensionWeights` | built from `top_careers[i].top_drivers[]` — map each driver's `feature` (an AI raw-feature name) back to its owning dimension (reverse of Table 1), summing impacts per dimension |
| `rfScore` | `round(top_careers[i].rf_confidence * 100)` |
| `xgbScore` | `round(top_careers[i].xgb_confidence * 100)` |

### 2c. `narrative` (→ `report.narrative`)

The AI service does not generate free-text narrative. The backend **synthesises** a narrative from the structured response — this is template-based, not a new ML capability:

```
"{firstName}'s assessment shows strongest alignment with {topCareer.career}
 ({topCareer.confidence_pct}% match). Key strengths include {topDrivers
 mapped to dimension names}. Both models agree: {models_agree}."
```

Full template in DTO file below.

### 2d. `modelVersion` / `confidence` (→ `assessment.aiMetadata`)

| Backend field | AI source |
|---|---|
| `aiMetadata.modelVersion` | `model_info.version` |
| `aiMetadata.confidenceScore` | `confidence.top_career_confidence` (0-1 scale, matches `confidenceScore: { min:0, max:1 }` in schema) |
| `aiMetadata.inferenceMs` | measured client-side (unchanged) |

### 2e. PDF / Blockchain data

No new mapping needed — `pdf.service.js`'s `buildReportData()` (built in the previous session) already consumes `report.careerRecommendations[]` and `assessment.scores.*`. Since both are now correctly populated by this fix, PDF generation and blockchain anchoring receive correct data with **no further changes**.

---

## Summary of Files Changed

| File | Change |
|---|---|
| `backend/src/modules/assessment/assessment.aiClient.js` | **New** — request builder + response adapter (the integration layer) |
| `backend/src/modules/assessment/assessment.dto.js` | **New** — DTOs/types for AI request & response, narrative templates, category map |
| `backend/src/modules/assessment/assessment.service.js` | `scoreAssessment()` rewritten to use `aiClient`; `buildFeatureVector` removed (logic moved to `aiClient`) |
| `backend/src/modules/assessment/assessment.validation.js` | Add validation for AI response before persisting |
| `backend/src/modules/assessment/assessment.controller.js` | Add `/retry-scoring` admin endpoint for failed assessments |
| `backend/src/modules/assessment/assessment.routes.js` | Wire new retry route |
| `ai-service/api/app.py` | **No change** |
| `frontend/src/services/api.js` | No change to call signatures; `AssessmentResults.jsx` gains new optional fields (`narrative`, `topDrivers`) — additive only |
