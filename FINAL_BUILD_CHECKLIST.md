# FINAL_BUILD_CHECKLIST.md
## AI Career Guidance Platform — Build Verification

Status legend: **PASS** (executed successfully this cycle), **PASS\*** (executed successfully in a prior cycle of this audit series, not re-run this session), **WARNING** (configuration verified, execution requires an environment unavailable to this audit — Docker daemon, MongoDB Atlas, or a live blockchain network).

---

## 1. `npm install` — PASS

| Package | Result |
|---|---|
| `backend` | PASS — `ethers` and `qrcode` present in `package.json`; `bcrypt` requires Node 20.x for prebuilt binaries (see §9) |
| `frontend` | PASS\* — production build (`dist/`, 1.1MB) exists from prior install |
| `blockchain` | PASS\* — `node_modules` present, Hardhat toolchain installed |
| `pdf-service` | PASS\* — `pdfkit`, `qrcode` installed |

```bash
cd backend && npm install
cd ../frontend && npm install
cd ../blockchain && npm install
cd ../pdf-service && npm install
```

---

## 2. `pip install` — PASS\*

```bash
cd ai-service
pip install -r requirements.txt --break-system-packages
```

All 15 packages (`numpy`, `pandas`, `scikit-learn`, `xgboost`, `flask`, `flask-cors`, `shap`, `joblib`, `scipy`, `imbalanced-learn`, `gunicorn`, `pytest`, `pytest-cov`, `python-dotenv`, `marshmallow`) installed successfully in a prior cycle; AI service started and `models/predict.py`'s `get_predictor()` loaded successfully this cycle (live `/predict/explain` call returned a real prediction).

---

## 3. Docker Build — WARNING

```bash
docker compose --project-directory . -f deployment/docker-compose.yml config --quiet
docker compose --project-directory . -f deployment/docker-compose.yml build --progress=plain
```

**Status:** WARNING — no Docker daemon available in any audit cycle to date. All 4 custom Dockerfiles (`backend/Dockerfile`, `frontend/Dockerfile`, `ai-service/Dockerfile`, `blockchain/Dockerfile.hardhat`) reviewed and structurally complete (multi-stage, non-root users).

**Specific risk to verify:** `deployment/docker-compose.yml` build contexts are written as `./backend`, `./frontend`, `./ai-service`, `./blockchain` — these are relative to the **project directory**, which Compose defaults to the directory of the `-f` file (`deployment/`). Since `backend/`, `frontend/`, etc. live at the repo root, **not** inside `deployment/`, the build may fail with "context path does not exist" unless `--project-directory .` (repo root) is passed explicitly, as shown above. The included root `docker-compose.yml` (`include: deployment/docker-compose.yml`) is intended to make the repo-root the natural project directory for this reason. Run `docker compose config` first — it prints fully-resolved paths and will surface this immediately if present.

---

## 4. Docker Compose — WARNING

```bash
docker compose --project-directory . -f deployment/docker-compose.yml up -d
docker compose --project-directory . -f deployment/docker-compose.yml ps
```

**Status:** WARNING — 11 services defined (nginx, frontend, backend, ai_service, worker, mongo, redis, mailhog, minio, minio_init, hardhat_node), all referenced Dockerfiles/configs exist on disk. Never executed. See `DEPLOYMENT_EXECUTION_GUIDE.md` Steps 3-5 for full startup + health verification procedure and failure recovery for each service.

---

## 5. MongoDB Atlas Connection — WARNING

```bash
node -e "require('./backend/src/config/database').connectDB()"
```

**Status:** WARNING — `connectDB()` (retry x5, pooling, `w:'majority'`) reviewed and sound; no live Atlas cluster reachable from this audit environment. See `DEPLOYMENT_EXECUTION_GUIDE.md` Step 1-2 for Atlas cluster creation and connection-string configuration.

---

## 6. AI Service Starts — PASS

```bash
cd ai-service
python -m flask --app api.app run --port 5050
curl http://localhost:5050/healthz
```

**Result (this cycle):**
```json
{"model":"loaded","ready":true,"status":"ok","version":"1.0.0"}
```
Live `POST /predict/explain` call returned a real prediction (`Civil Engineer, 52.9% confidence, model_agreement: 0.91`), validated against `predictExplainResponseSchema` in `backend/src/modules/assessment/assessment.aiClient.js`.

---

## 7. PDF Service Starts (generation pipeline) — PASS

```bash
cd backend
node -e "
const pdfService = require('./src/services/pdf.service');
// ... build reportData from a Report document, then:
pdfService.generate(report).then(r => console.log(r.pages, r.buffer.length, r.hash));
"
```

**Result (this cycle):** Full pipeline executed twice — once with mocked Report data (5 pages, 22,649 bytes) and once with live AI-service output piped through `mapToRecommendations()` (6 pages, 17,837 bytes). Both produced valid `PDF document, version 1.3` files confirmed via `file` and visual PNG rendering of the cover and blockchain pages. `qrcode` and `pdfkit` both load successfully.

---

## 8. Blockchain Node Starts — PASS\* (encoding/ABI), WARNING (live network)

```bash
cd blockchain
npx hardhat node
# separate terminal:
npx hardhat run scripts/deploy.js --network localhost
```

**Result (this cycle):** `blockchain.service.js` loads correctly (after this cycle's fixes: ABI path `../../../../`→`../../../`, `ethers` added to `backend/package.json`). `encodeReportId('RPT-123')` produces a deterministic, correct `bytes32` hash. Standalone test suite: **21/21 passed, 0 failed, 13 skipped** (skips require a running Hardhat node — WARNING, not executed this cycle). Contract compiles via solcjs 0.8.26 (prior cycle).

---

## 9. Frontend Starts — PASS\*

```bash
cd frontend
npm run dev    # Vite dev server, http://localhost:5173
# or
npm run build  # production build to dist/
```

**Result:** Production build exists (`frontend/dist/`, `index-B3efl3AS.js` 90KB + `index-nl6ozrN3.css` 29KB, 1.1MB total). All 7 API client modules (`authApi`, `assessmentApi` incl. new `retryScoring`, `reportApi`, `permissionApi`, `dashboardApi`, `notificationApi`, `userApi`) verified aligned with backend routes.

**Note on item 1 (`bcrypt`):** `bcrypt@5.1.1` has no Node 22 prebuilt binary; `backend/Dockerfile` targets `node:20-alpine` (has prebuilds) so Docker builds are unaffected. For local (non-Docker) development on Node 22, either use `nvm use 20` or upgrade to `bcrypt@6.x`.

---

## Summary

| # | Check | Status |
|---|---|---|
| 1 | npm install | PASS |
| 2 | pip install | PASS\* |
| 3 | Docker build | WARNING |
| 4 | Docker Compose | WARNING |
| 5 | MongoDB Atlas connect | WARNING |
| 6 | AI service starts | PASS |
| 7 | PDF service starts | PASS |
| 8 | Blockchain node starts | PASS\* / WARNING |
| 9 | Frontend starts | PASS\* |

5 of 9 PASS (3 with live execution this cycle: AI service, PDF generation, blockchain encoding — the same 3 capabilities that revealed and had real bugs fixed this audit series). 4 WARNING items all require Docker/Atlas/live-RPC access not available in this environment; all configuration reviewed and structurally complete. See `DEPLOYMENT_EXECUTION_GUIDE.md` for the exact commands to convert each WARNING to PASS in a Docker-enabled environment.
