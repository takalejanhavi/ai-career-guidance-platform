# API Contracts — AI Integration Fix
## CareerAI Platform

---

## 1. Internal Contract: Backend ↔ AI Service

### `POST {AI_SERVICE_URL}/predict/explain`

This endpoint **already existed** and is unchanged. The backend now calls it correctly.

**Headers:**
```
Content-Type: application/json
X-Internal-Token: <AI_SERVICE_SECRET>
```

**Request body** (built by `assessment.aiClient.buildFeatureVector()`):
```json
{
  "math_score": 75,
  "science_score": 77,
  "english_score": 63,
  "communication": 63,
  "leadership": 73,
  "creativity": 60,
  "analytical_thinking": 74,
  "extroversion": 70,
  "conscientiousness": 78,
  "extracurricular": 80,
  "top_n": 3
}
```
All 10 `AI_RAW_FEATURES` are required, each 0-100. `top_n` is optional (AI service defaults to 3, max 10).

**Response body** (validated by `predictExplainResponseSchema`):
```json
{
  "status": "success",
  "top_careers": [
    {
      "rank": 1,
      "career": "Civil Engineer",
      "confidence_pct": 52.9,
      "confidence_tier": "Moderate",
      "model_agreement": 0.91,
      "description": "Design and build infrastructure...",
      "key_traits": ["Math aptitude", "Analytical thinking", "Science knowledge", "Detail orientation"],
      "growth_outlook": "stable",
      "salary_range": { "min": 70000, "max": 140000, "currency": "USD" },
      "top_drivers": [
        { "feature": "stem_vs_social_ratio", "impact": 0.21, "direction": "positive" },
        { "feature": "leadership", "impact": 0.05, "direction": "positive" }
      ]
    }
    // ... up to top_n entries
  ],
  "confidence": {
    "top_career_confidence": 0.529,
    "confidence_gap": 0.07,
    "prediction_certainty": "Moderate",
    "models_agree": true,
    "entropy": 1.05
  },
  "input": { "math_score": 75.0, "...": "..." },
  "engineered_features": { "academic_overall": 0.11, "...": "..." }
}
```

**Notes:**
- `model_info` is **not** present in `/predict/explain` responses (only in `/predict`). `aiClient` defaults `modelVersion` to `'1.0.0'` when absent.
- `top_drivers[].feature` may be a raw feature (`math_score`) or an **engineered** feature (`stem_vs_social_ratio`, `social_aptitude`, etc.) — both are mapped to dimensions via `FEATURE_TO_DIMENSION` + `ENGINEERED_FEATURE_TO_DIMENSION`.
- `salary_range` is an object `{min, max, currency}`, not a tuple.
- No per-career `rf_confidence`/`xgb_confidence` — `rfScore`/`xgbScore` in the mapped output are **derived approximations** from `confidence_pct` and `model_agreement`.

**Error responses** (unchanged from existing AI service):
| Status | Meaning | aiClient behavior |
|---|---|---|
| 400 | Malformed JSON / missing body | No retry — `AIServiceError` thrown immediately |
| 401 | Missing/invalid `X-Internal-Token` | No retry — `AIServiceError` thrown immediately |
| 422 | Input validation failed (feature out of 0-100 range) | No retry — `AIServiceError` thrown immediately |
| 503 | Model not loaded | Retried up to 2x with exponential backoff (500ms, 1000ms) |
| Network error / timeout | AI service unreachable | Retried up to 2x with exponential backoff |

---

## 2. Student-Facing Contract: Assessment Endpoints

All endpoints below are mounted at `/api/v1/assessments` and require `Authorization: Bearer <accessToken>`.

### `POST /assessments/:id/submit` — unchanged signature, new internal behavior

**Request:** (unchanged)
```
POST /api/v1/assessments/65f.../submit
```

**Response:** (unchanged — 200 OK)
```json
{
  "success": true,
  "data": { "assessment": { "_id": "65f...", "status": "submitted", "...": "..." } },
  "message": "Assessment submitted. Scoring in progress."
}
```

**What changed internally:** scoring now succeeds. Previously, `assessment.status` would transition `submitted` → `failed` within seconds (404 from `/recommend`). Now it transitions `submitted` → `scored`, with `assessment.scores`, `assessment.aiMetadata`, and a generated `Report` document populated correctly.

---

### `GET /assessments/:id` — new fields in response

**Response when `status: 'scored'`:**
```json
{
  "success": true,
  "data": {
    "assessment": {
      "_id": "65f...",
      "status": "scored",
      "scores": {
        "aptitude":      { "score": 74, "tier": "high", "percentile": 78 },
        "interest":      { "score": 70, "tier": "high", "percentile": 74 },
        "personality":   { "score": 70, "tier": "high", "percentile": 74 },
        "values":        { "score": 72, "tier": "high", "percentile": 76 },
        "learningStyle": { "score": 74, "tier": "high", "percentile": 78 },
        "overall": 72
      },
      "aiMetadata": {
        "modelVersion": "1.0.0",
        "inferenceMs": 247,
        "confidenceScore": 0.529,
        "processedAt": "2026-06-11T01:19:43.000Z"
      },
      "failureReason": null
    }
  }
}
```

**Response when `status: 'failed'`** (NEW field — previously this state had no diagnostic info):
```json
{
  "success": true,
  "data": {
    "assessment": {
      "_id": "65f...",
      "status": "failed",
      "scores": null,
      "failureReason": "AI service error: AI service unreachable: connect ECONNREFUSED 127.0.0.1:5050"
    }
  }
}
```

---

### `POST /assessments/:id/retry-scoring` — NEW endpoint

Re-queues AI scoring for an assessment in `failed` status. Student-only, owner-only.

**Request:**
```
POST /api/v1/assessments/65f.../retry-scoring
Authorization: Bearer <accessToken>
(no body)
```

**Response — 202 Accepted:**
```json
{
  "success": true,
  "data": { "assessment": { "_id": "65f...", "status": "submitted" } },
  "message": "Scoring re-queued"
}
```

**Error responses:**
| Status | Code | Condition |
|---|---|---|
| 404 | `NOT_FOUND` | Assessment doesn't exist or doesn't belong to caller |
| 400 | `NOT_FAILED` | `assessment.status !== 'failed'` |
| 400 | `NO_RESPONSES` | Assessment has zero responses (shouldn't happen for a submitted assessment) |

---

## 3. Reports Contract — No Changes Required

`report.careerRecommendations[]` now receives correctly-shaped data from `mapToRecommendations()`. The `Report` model schema (`CareerRecSchema` in `report.model.js`) is **unchanged** — every field the AI integration now populates (`careerSlug`, `careerTitle`, `category`, `matchScore`, `matchLabel`, `description`, `dimensionWeights`, `salaryRange`, `keySkills`, `growthOutlook`) already existed in the schema; they were simply never populated correctly before this fix.

`pdf.service.js`'s `buildReportData()` (built in the prior session) already consumes these fields — verified end-to-end in this session: 29 responses → AI → `careerRecommendations[]` → 6-page PDF, 17.8KB, valid SHA-256 hash.

`blockchain.service.js` anchors `report.pdf.sha256Hash` — also unchanged, and now receives a hash computed from a PDF containing real career data instead of empty/failed report data.
