# Frontend Expectations — AI Integration Fix
## CareerAI Platform

---

## Summary

The fix is **fully backward-compatible** for the frontend. No existing call signatures changed. Two additive changes were made:

1. `assessmentApi.retryScoring(id)` — new function
2. `AssessmentResults.jsx` — handles the `'failed'` status with a retry UI (previously this status had no dedicated handling; the page would just show "being scored" forever since polling never stopped)

---

## 1. `frontend/src/services/api.js` — New Function

```js
export const assessmentApi = {
  getQuestions:     (params) => api.get('/assessments/questions', { params }),
  start:            (data)   => api.post('/assessments/start', data),
  submitResponse:   (id, data) => api.patch(`/assessments/${id}/answer`, data),
  submit:           (id)     => api.post(`/assessments/${id}/submit`),
  getOne:           (id)     => api.get(`/assessments/${id}`),
  getMy:            (params) => api.get('/assessments/my', { params }),
  retryScoring:     (id)     => api.post(`/assessments/${id}/retry-scoring`),  // NEW
};
```

No other API modules require changes. `reportApi` and `pdf.service.js` (backend) were already verified to consume `report.careerRecommendations[]` correctly in the prior session — this fix just ensures that array is now populated with real data instead of being empty (because `scoreAssessment` previously threw before reaching `Queues.PDF.add('generate-report', ...)`).

---

## 2. `AssessmentResults.jsx` — Behavior Changes

### Before this fix
- Polling (`refetchInterval`) only stopped when `status === 'scored'`.
- Since every assessment ended in `status: 'failed'` (due to the `/recommend` 404), **polling never stopped** — the page would poll every 5 seconds indefinitely, showing "Your assessment is being scored by our AI engine…" forever.
- No UI existed for the `'failed'` state.

### After this fix
- Polling stops on **either** `'scored'` or `'failed'`.
- A new card renders when `status === 'failed'`, showing:
  - The human-readable `assessment.failureReason` (new field, populated by the backend — e.g. `"AI service error: AI service unreachable: ..."`)
  - A **"Retry scoring"** button that calls `assessmentApi.retryScoring(id)` and invalidates the query cache on success, triggering a re-fetch (which will show `status: 'submitted'` and resume polling)

### New optional fields available on `assessment` object

| Field | Type | When present |
|---|---|---|
| `assessment.failureReason` | `string \| null` | Set when `status === 'failed'`. Human-readable error from `aiClient.AIServiceError` or `AIResponseValidationError`. |
| `assessment.scores.*.percentile` | `number` | Already existed in schema, now reliably populated (was `null` before the fix since scoring never completed) |

No fields were removed or renamed — existing consumers of `assessment.scores.{aptitude,interest,personality,values,learningStyle,overall}` continue to work unchanged.

---

## 3. `ReportPage.jsx` — No Changes Required, But New Data Now Flows Through

The report page already renders `report.careerRecommendations[]` (verified working against the PDF mapper in the prior session). After this fix, that array now contains:

- Real `careerTitle`, `category`, `matchScore`, `matchLabel` from the AI service
- `description` and `keySkills` from `CAREER_NARRATIVES` in `predict.py`
- `salaryRange` with real USD figures
- `dimensionWeights` derived from the AI's `top_drivers` (previously this object existed in the schema but was never populated)
- `narrative` (new — `report.narrative` is now a generated paragraph, e.g. *"Alexandra's assessment results show the strongest alignment with Civil Engineer (52.9% match)..."*)

If `ReportPage.jsx` does not currently render `report.narrative`, this is a **good opportunity** to add a "Career Profile Summary" section displaying it — the field is now reliably populated as a 2-4 sentence paragraph suitable for direct display. This is optional and does not block the fix; the PDF already renders this narrative on its assessment page regardless of whether the frontend displays it.

---

## 4. No Changes Needed To

- `authApi`, `permissionApi`, `dashboardApi`, `notificationApi`, `userApi` — untouched
- `AssessmentPage.jsx` (the 29-question flow) — untouched, still calls `submitResponse`/`submit` exactly as before
- `MyReports.jsx`, `PermissionsPage.jsx`, `PsychologistDashboard.jsx`, `StudentsList.jsx` — untouched
- Axios interceptors / token refresh logic — untouched
- `reportApi.getPdfUrl()` flow — untouched; PDF generation now receives correct data but the API contract for fetching it is unchanged
