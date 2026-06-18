# RELEASE_MANIFEST.md
## AI Career Guidance Platform — v1.0.0

---

## Folder Tree

```
career-guidance-platform/
├── frontend/                  React + Vite + Tailwind + Framer Motion + React Query
│   ├── src/
│   │   ├── animations/
│   │   ├── components/{charts,common,layout}/
│   │   ├── hooks/
│   │   ├── pages/{auth,psychologist,shared,student}/
│   │   ├── services/
│   │   ├── store/
│   │   └── utils/
│   ├── index.html, vite.config.js, tailwind.config.js, postcss.config.js
│   ├── package.json, Dockerfile, .env.example, .gitignore
│
├── backend/                   Node.js + Express + MongoDB + JWT + RBAC
│   ├── src/
│   │   ├── config/            env, database, logger, redis/queues
│   │   ├── jobs/               workers.js (Bull consumers)
│   │   ├── middleware/         auth, rbac, validate, rateLimiter, errorHandler
│   │   ├── modules/
│   │   │   ├── assessment/      questions, AI client, scoring
│   │   │   ├── audit/
│   │   │   ├── auth/
│   │   │   ├── dashboard/
│   │   │   ├── notifications/
│   │   │   ├── permissions/
│   │   │   ├── psychologist/
│   │   │   ├── reports/
│   │   │   └── users/
│   │   ├── scripts/             ensureIndexes, seed
│   │   ├── services/            blockchain, email, pdf (+ pdf/ subtree)
│   │   └── utils/                AppError, apiResponse, catchAsync, tokens
│   ├── tests/{unit,integration}/
│   ├── docs/                    integration/architecture reference docs
│   ├── package.json, Dockerfile, docker-compose.yml, .env.example, .gitignore, .dockerignore
│
├── ai-service/                 Python Flask + scikit-learn + XGBoost + pandas + NumPy
│   ├── api/                     app.py (Flask routes)
│   ├── models/                  predict.py, train.py (artefacts generated at build time)
│   ├── utils/                   feature_engineering.py
│   ├── tests/                   test_all.py
│   ├── requirements.txt, Dockerfile, wsgi.py, gunicorn.conf.py, .env.example
│
├── blockchain/                  Solidity + Hardhat + ethers.js
│   ├── contracts/                CareerReport.sol, CareerReportFactory.sol
│   ├── scripts/                  deploy.js
│   ├── test/                     contract + integration tests
│   ├── src/                      standalone optional blockchain API (web3-based, not used by backend)
│   ├── hardhat.config.js, package.json, Dockerfile.hardhat, .env.example
│
├── pdf-service/                  Reference PDF generator source (canonical copy lives in backend/src/services/pdf/)
│   ├── src/{generators,utils}/
│   ├── tests/test.js
│   ├── package.json
│
├── schemas/                       Legacy reference Mongoose models (unused — backend has its own)
│
└── deployment/                    Docker, Docker Compose, NGINX, Render, Railway, CI/CD
    ├── dockerfiles/                Dockerfile.ai, Dockerfile.backend, Dockerfile.frontend
    ├── docker-compose.yml, docker-compose.prod.yml
    ├── nginx/                      nginx.conf, nginx.dev.conf, frontend.conf, careerguidance.conf
    ├── envs/                       .env.development, .env.staging, .env.production
    ├── github-actions/             ci.yml, cd.yml, security.yml
    ├── render/render.yaml
    ├── railway/                    railway.json, nixpacks.backend.toml, railway-setup.sh
    ├── monitoring/                 prometheus.yml, alerts.yml
    ├── scripts/                    mongo-init.js, start-dev.sh
    └── GITHUB_SECRETS.md
```

---

## Service Relationships

| From | To | Mechanism |
|---|---|---|
| frontend | backend | `axios` → `/api/v1/*` (NGINX-proxied in Docker, direct in dev) |
| backend (worker) | ai-service | `axios POST /predict/explain` + `X-Internal-Token` header |
| backend (worker) | pdf generation | direct in-process `require('./services/pdf/ReportGenerator')` |
| backend (worker) | blockchain | `ethers.js` → Hardhat/testnet RPC via `blockchain.service.js` |
| backend | MongoDB Atlas | `mongoose.connect(MONGODB_URI)` |
| backend ↔ worker | Redis | Bull queues (`PDF`, `BLOCKCHAIN`, `EMAIL`, `NOTIFICATION`) |
| backend | S3/MinIO | PDF upload via `@aws-sdk/client-s3` (mock fallback if unconfigured) |
| blockchain.service.js | CareerReport.sol | ABI from `blockchain/artifacts/...` (falls back to embedded `MINIMAL_ABI`) |
| NGINX | frontend, backend, ai_service, hardhat_node | reverse-proxy upstreams in `nginx.dev.conf` / `nginx.conf` |

---

## Dependencies by Service

**frontend** (`package.json`): @hookform/resolvers, @tanstack/react-query, @tanstack/react-query-devtools, axios, clsx, date-fns, framer-motion, lucide-react, react, react-dom, react-hook-form, react-hot-toast, react-router-dom, recharts, tailwind-merge, zod, zustand

**backend** (`package.json`): axios, bcrypt, bull, compression, cookie-parser, cors, dotenv, ethers, express, express-mongo-sanitize, express-rate-limit, express-validator, helmet, hpp, ioredis, jsonwebtoken, mongoose, morgan, multer, nodemailer, pdfkit, qrcode, uuid, winston, winston-daily-rotate-file, xss-clean, zod

**ai-service** (`requirements.txt`): numpy==1.26.4, pandas==2.2.2, scikit-learn==1.5.0, xgboost==2.0.3, flask==3.0.3, flask-cors==4.0.1, shap==0.45.1, joblib==1.4.2, scipy==1.13.1, imbalanced-learn==0.12.3, gunicorn==22.0.0, pytest==8.2.2, pytest-cov==5.0.0, python-dotenv==1.0.1, marshmallow==3.21.3

**blockchain** (`package.json`, standalone module — Hardhat dev deps + web3): cors, dotenv, express, web3 (Hardhat/ethers used at the project-root devDependency level for compile/test/deploy)

**pdf-service** (`package.json`): pdfkit, qrcode (mirrors `backend` PDF dependencies — canonical copy is `backend/src/services/pdf/`)

---

## Pre-Generation Verification

- **Missing imports:** None — `npx jest tests/unit --runInBand` → 42/42 pass; `assessment.aiClient.js`, `assessment.dto.js`, `pdf.service.js`, `blockchain.service.js` all load successfully with required env vars set.
- **Missing files:** None in the active stack (backend, frontend, ai-service, blockchain, deployment). `pdf-service/` and `schemas/` are reference/legacy modules not wired into `docker-compose.yml` — present for documentation purposes, not required at runtime.
- **TODOs/FIXMEs/placeholders:** `grep -rln "TODO\|FIXME\|PLACEHOLDER\|XXX"` across all `.js`/`.jsx`/`.py`/`.sol` source returns **zero matches**.
- **Live-verified integrations this release cycle:** AI service `/predict/explain` (real prediction returned), PDF generation (6-page PDF from live AI output), blockchain ABI encoding (`encodeReportId` deterministic, 21/21 blockchain tests pass).

---

## File-by-File Inventory

### frontend (37 files)

| File | Purpose |
|---|---|
| `frontend/.env.example` | Template of required environment variables (no real secrets) |
| `frontend/.gitignore` | Git exclusion rules for this package |
| `frontend/Dockerfile` | Multi-stage container build definition |
| `frontend/index.html` | SPA HTML entrypoint mounted by Vite/React |
| `frontend/package.json` | npm package manifest — dependencies and scripts |
| `frontend/postcss.config.js` | PostCSS pipeline configuration (Tailwind + Autoprefixer) |
| `frontend/src/App.jsx` | Root React component — router and route-guard definitions |
| `frontend/src/animations/variants.js` | Framer Motion animation variant presets |
| `frontend/src/components/charts/index.jsx` | Recharts-based chart components (radar, bar, progress) |
| `frontend/src/components/common/index.jsx` | Shared UI primitives (Button, Badge, Card, PageLoader, etc.) |
| `frontend/src/components/layout/AppLayout.jsx` | Authenticated app shell layout (Navbar + Sidebar + content) |
| `frontend/src/components/layout/AuthLayout.jsx` | Unauthenticated layout for login/register pages |
| `frontend/src/components/layout/Navbar.jsx` | Top navigation bar component |
| `frontend/src/components/layout/Sidebar.jsx` | Role-aware sidebar navigation component |
| `frontend/src/hooks/useAuth.js` | Authentication state/actions hook (login, logout, refresh) |
| `frontend/src/hooks/useData.js` | React Query data-fetching hook wrappers |
| `frontend/src/index.css` | Tailwind base/component/utility layer imports + global styles |
| `frontend/src/main.jsx` | React application bootstrap — mounts <App /> with providers |
| `frontend/src/pages/LandingPage.jsx` | Public marketing landing page |
| `frontend/src/pages/NotFoundPage.jsx` | 404 fallback page |
| `frontend/src/pages/auth/LoginPage.jsx` | Login form page |
| `frontend/src/pages/auth/RegisterPage.jsx` | Registration form page |
| `frontend/src/pages/psychologist/PsychologistDashboard.jsx` | Psychologist landing dashboard |
| `frontend/src/pages/psychologist/StudentsList.jsx` | Psychologist — list of assigned students |
| `frontend/src/pages/shared/PermissionsPage.jsx` | Manage report-sharing permissions |
| `frontend/src/pages/shared/ProfilePage.jsx` | User profile view/edit page |
| `frontend/src/pages/shared/ReportPage.jsx` | Career report viewer (scores, recommendations, PDF, blockchain) |
| `frontend/src/pages/shared/SettingsPage.jsx` | Account settings page |
| `frontend/src/pages/student/AssessmentPage.jsx` | 29-question assessment flow UI |
| `frontend/src/pages/student/AssessmentResults.jsx` | Post-assessment results/scoring-status page with retry UI |
| `frontend/src/pages/student/MyReports.jsx` | Student — list of generated reports |
| `frontend/src/pages/student/StudentDashboard.jsx` | Student landing dashboard |
| `frontend/src/services/api.js` | Axios instance + per-module API client functions |
| `frontend/src/store/authStore.js` | Zustand auth/session global store |
| `frontend/src/utils/helpers.js` | Generic frontend utility/formatting functions |
| `frontend/tailwind.config.js` | Tailwind CSS theme/scan configuration |
| `frontend/vite.config.js` | Vite build/dev-server configuration |

### backend (84 files)

| File | Purpose |
|---|---|
| `backend/.dockerignore` | Docker build-context exclusion rules |
| `backend/.env.example` | Template of required environment variables (no real secrets) |
| `backend/.gitignore` | Git exclusion rules for this package |
| `backend/Dockerfile` | Multi-stage container build definition |
| `backend/docker-compose.yml` | Docker Compose service orchestration definition |
| `backend/docs/ai-integration-mapping.md` | Session integration/architecture documentation (reference) |
| `backend/docs/api-contracts-ai-fix.md` | Session integration/architecture documentation (reference) |
| `backend/docs/blockchain-root-cause.md` | Session integration/architecture documentation (reference) |
| `backend/docs/frontend-expectations-ai-fix.md` | Session integration/architecture documentation (reference) |
| `backend/docs/pdf-architecture.md` | Session integration/architecture documentation (reference) |
| `backend/logs/.5780716b8e88ed68ab11aee9071aa63e697eecff-audit.json` | Runtime-generated Winston log file (not part of source release) |
| `backend/logs/.b3d7db7378bd4b974e4d4b33ba5264fe13877cf0-audit.json` | Runtime-generated Winston log file (not part of source release) |
| `backend/logs/combined-2026-06-11.log` | Runtime-generated Winston log file (not part of source release) |
| `backend/logs/error-2026-06-11.log` | Runtime-generated Winston log file (not part of source release) |
| `backend/package.json` | npm package manifest — dependencies and scripts |
| `backend/src/app.js` | Express app — middleware stack, route mounting, error handler |
| `backend/src/config/database.js` | MongoDB/Mongoose connection with retry + pooling |
| `backend/src/config/env.js` | Zod-validated environment variable schema |
| `backend/src/config/logger.js` | Winston logger configuration |
| `backend/src/config/redis.js` | Redis connection + Bull queue definitions |
| `backend/src/jobs/workers.js` | Bull queue consumers (scoring, PDF, blockchain, email, notifications) |
| `backend/src/middleware/auth.middleware.js` | JWT authentication middleware (access-token verification) |
| `backend/src/middleware/errorHandler.js` | Global Express error handler |
| `backend/src/middleware/rateLimiter.js` | Redis-backed rate limiters (auth, password-reset, PDF, API) |
| `backend/src/middleware/rbac.middleware.js` | Role-based access control guards |
| `backend/src/middleware/requestId.js` | Per-request correlation ID middleware |
| `backend/src/middleware/validate.js` | Zod request-validation middleware factory |
| `backend/src/modules/assessment/assessment.aiClient.js` | AI service integration adapter (feature mapping, /predict/explain call, response mapping) |
| `backend/src/modules/assessment/assessment.controller.js` | Assessment HTTP handlers |
| `backend/src/modules/assessment/assessment.dto.js` | AI feature/dimension mapping tables and narrative templates |
| `backend/src/modules/assessment/assessment.model.js` | Mongoose Assessment schema |
| `backend/src/modules/assessment/assessment.routes.js` | Assessment route definitions |
| `backend/src/modules/assessment/assessment.service.js` | Assessment business logic (start/answer/submit/score/retry) |
| `backend/src/modules/assessment/assessment.validation.js` | Zod schemas for assessment endpoints |
| `backend/src/modules/assessment/question_bank.json` | 29-question assessment question bank (5 sections) |
| `backend/src/modules/audit/auditlog.model.js` | Mongoose AuditLog schema + write() helper |
| `backend/src/modules/auth/auth.controller.js` | Auth HTTP handlers (register/login/refresh/logout/etc.) |
| `backend/src/modules/auth/auth.routes.js` | Auth route definitions |
| `backend/src/modules/auth/auth.service.js` | Auth business logic (registration, login, token issuance, lockout) |
| `backend/src/modules/auth/auth.validation.js` | Zod schemas for auth endpoints |
| `backend/src/modules/dashboard/dashboard.routes.js` | Dashboard route definitions (calls service directly — no controller) |
| `backend/src/modules/dashboard/dashboard.service.js` | Role-based dashboard aggregation queries |
| `backend/src/modules/notifications/notification.model.js` | Mongoose Notification schema (18 type enum, multi-channel) |
| `backend/src/modules/notifications/notification.routes.js` | Notification route definitions (calls service directly) |
| `backend/src/modules/notifications/notification.service.js` | Notification creation/delivery logic |
| `backend/src/modules/permissions/permission.controller.js` | Permission HTTP handlers |
| `backend/src/modules/permissions/permission.model.js` | Mongoose Permission schema + canAccess() static |
| `backend/src/modules/permissions/permission.routes.js` | Permission route definitions |
| `backend/src/modules/permissions/permission.service.js` | Grant/revoke/update/list permission logic |
| `backend/src/modules/psychologist/psychologist.model.js` | Mongoose Psychologist profile schema |
| `backend/src/modules/psychologist/psychologist.routes.js` | Psychologist route definitions (calls service directly) |
| `backend/src/modules/psychologist/psychologist.service.js` | Verification, assignment, profile logic |
| `backend/src/modules/reports/report.controller.js` | Report HTTP handlers |
| `backend/src/modules/reports/report.model.js` | Mongoose Report schema (recommendations, pdf, blockchain, annotations) |
| `backend/src/modules/reports/report.routes.js` | Report route definitions |
| `backend/src/modules/reports/report.service.js` | Report create/get/list/visibility/annotate/anchor/verify logic |
| `backend/src/modules/users/user.controller.js` | User HTTP handlers |
| `backend/src/modules/users/user.model.js` | Mongoose User schema (auth fields, bcrypt hooks, lockout) |
| `backend/src/modules/users/user.routes.js` | User route definitions |
| `backend/src/modules/users/user.service.js` | User CRUD/role-management logic |
| `backend/src/modules/users/user.validation.js` | Zod schemas for user endpoints |
| `backend/src/scripts/ensureIndexes.js` | Creates/verifies MongoDB indexes for all collections |
| `backend/src/scripts/seed.js` | Development seed script — creates 4 demo users |
| `backend/src/server.js` | HTTP server bootstrap — connects DB/Redis, starts Express + workers |
| `backend/src/services/blockchain.service.js` | ethers.js v6 wrapper for CareerReport contract (anchor/verify/revoke) |
| `backend/src/services/email.service.js` | Nodemailer email-sending wrapper (SMTP/MailHog) |
| `backend/src/services/pdf.service.js` | ReportGenerator wrapper — data mapper + generate + S3 upload |
| `backend/src/services/pdf/ReportGenerator.js` | PDF report orchestrator (copied from pdf-service) |
| `backend/src/services/pdf/generators/assessmentPage.js` | PDF page: dimension scores + radar/bar charts |
| `backend/src/services/pdf/generators/blockchainPage.js` | PDF page: blockchain verification + QR code |
| `backend/src/services/pdf/generators/careersPage.js` | PDF page: career recommendation cards |
| `backend/src/services/pdf/generators/coverPage.js` | PDF page: cover/title page |
| `backend/src/services/pdf/generators/psychologistPage.js` | PDF page: psychologist review notes |
| `backend/src/services/pdf/utils/design.js` | PDF design tokens (colors, fonts, spacing, layout) |
| `backend/src/services/pdf/utils/draw.js` | PDFKit vector drawing primitives (bars, radar, donut charts) |
| `backend/src/utils/AppError.js` | Custom application error class + factory helpers |
| `backend/src/utils/apiResponse.js` | success()/created()/paginated() response helpers |
| `backend/src/utils/catchAsync.js` | Async route-handler error-forwarding wrapper |
| `backend/src/utils/tokens.js` | RS256 JWT sign/verify + refresh-cookie options |
| `backend/tests/integration/auth.test.js` | Integration tests — registration/login/token flow |
| `backend/tests/unit/errorHandler.test.js` | Unit tests — global error handler |
| `backend/tests/unit/middleware.test.js` | Unit tests — auth/RBAC middleware |
| `backend/tests/unit/tokens.test.js` | Unit tests — JWT sign/verify |
| `backend/tests/unit/utils.test.js` | Unit tests — AppError/apiResponse/catchAsync |

### ai-service (19 files)

| File | Purpose |
|---|---|
| `ai-service/.env.example` | Template of required environment variables (no real secrets) |
| `ai-service/.pytest_cache/.gitignore` | Git exclusion rules for this package |
| `ai-service/.pytest_cache/CACHEDIR.TAG` | pytest cache artifact (not part of source release) |
| `ai-service/.pytest_cache/README.md` | pytest cache artifact (not part of source release) |
| `ai-service/Dockerfile` | Multi-stage container build definition |
| `ai-service/__init__.py` | Python package marker |
| `ai-service/api/__init__.py` | Python package marker |
| `ai-service/api/app.py` | Flask app — /predict, /predict/explain, /predict/batch, /healthz routes |
| `ai-service/docker-compose.yml` | Docker Compose service orchestration definition |
| `ai-service/gunicorn.conf.py` | Gunicorn WSGI server configuration |
| `ai-service/models/__init__.py` | Python package marker |
| `ai-service/models/predict.py` | Prediction pipeline — RAW_FEATURES, CareerMatch, ensemble inference |
| `ai-service/models/train.py` | Model training script (RandomForest + XGBoost ensemble) |
| `ai-service/requirements.txt` | Python pip dependency manifest |
| `ai-service/tests/__init__.py` | Python package marker |
| `ai-service/tests/test_all.py` | AI service test suite (46 tests) |
| `ai-service/utils/__init__.py` | Python package marker |
| `ai-service/utils/feature_engineering.py` | 26-feature engineering pipeline (FeatureEngineer transformer) |
| `ai-service/wsgi.py` | WSGI entrypoint for Gunicorn |

### blockchain (14 files)

| File | Purpose |
|---|---|
| `blockchain/.env.example` | Template of required environment variables (no real secrets) |
| `blockchain/Dockerfile.hardhat` | Container build for local Hardhat blockchain node |
| `blockchain/contracts/CareerReport.sol` | Main report-anchoring smart contract |
| `blockchain/contracts/CareerReportFactory.sol` | Factory contract for deploying CareerReport instances |
| `blockchain/hardhat.config.js` | Hardhat network/compiler configuration |
| `blockchain/package.json` | npm package manifest — dependencies and scripts |
| `blockchain/scripts/deploy.js` | Contract deployment script |
| `blockchain/src/api/server.js` | Standalone Express API wrapping BlockchainService (optional, not used by backend) |
| `blockchain/src/index.js` | Public module entrypoint — exports BlockchainService, PERMISSIONS, encoders |
| `blockchain/src/services/BlockchainService.js` | Standalone ethers.js blockchain service class (optional, not used by backend) |
| `blockchain/src/utils/contractHelpers.js` | ABI-encoding helper functions for the standalone service |
| `blockchain/test/CareerReport.test.js` | Contract unit tests |
| `blockchain/test/contract.test.js` | Additional contract tests |
| `blockchain/test/integration.test.js` | End-to-end blockchain integration tests (21 tests) |

### pdf-service (13 files)

| File | Purpose |
|---|---|
| `pdf-service/package.json` | npm package manifest — dependencies and scripts |
| `pdf-service/src/ReportGenerator.js` | Original PDF report orchestrator (source of truth, copied into backend) |
| `pdf-service/src/api/server.js` | Optional standalone Express API for PDF microservice mode (unused) |
| `pdf-service/src/generators/assessmentPage.js` | PDF page generator (mirrored into backend/src/services/pdf/generators/) |
| `pdf-service/src/generators/blockchainPage.js` | PDF page generator (mirrored into backend/src/services/pdf/generators/) |
| `pdf-service/src/generators/careersPage.js` | PDF page generator (mirrored into backend/src/services/pdf/generators/) |
| `pdf-service/src/generators/coverPage.js` | PDF page generator (mirrored into backend/src/services/pdf/generators/) |
| `pdf-service/src/generators/psychologistPage.js` | PDF page generator (mirrored into backend/src/services/pdf/generators/) |
| `pdf-service/src/index.js` | pdf-service module entrypoint |
| `pdf-service/src/utils/design.js` | PDF design tokens (mirrored into backend) |
| `pdf-service/src/utils/draw.js` | PDFKit drawing primitives (mirrored into backend) |
| `pdf-service/src/utils/sampleData.js` | Sample report payload for manual testing |
| `pdf-service/tests/test.js` | PDF generator test suite (structure present, assertions incomplete) |

### deployment (24 files)

| File | Purpose |
|---|---|
| `deployment/GITHUB_SECRETS.md` | Documents required CI/CD secrets and generation commands |
| `deployment/docker-compose.prod.yml` | Docker Compose service orchestration definition |
| `deployment/docker-compose.yml` | Docker Compose service orchestration definition |
| `deployment/dockerfiles/Dockerfile.ai` | Multi-stage container build for the ai service |
| `deployment/dockerfiles/Dockerfile.backend` | Multi-stage container build for the backend service |
| `deployment/dockerfiles/Dockerfile.frontend` | Multi-stage container build for the frontend service |
| `deployment/envs/.env.development` | Development environment variable set (Docker Compose) |
| `deployment/envs/.env.production` | Production environment variable template (placeholders) |
| `deployment/envs/.env.staging` | Staging environment variable template |
| `deployment/github-actions/cd.yml` | GitHub Actions — continuous deployment pipeline |
| `deployment/github-actions/ci.yml` | GitHub Actions — continuous integration pipeline |
| `deployment/github-actions/security.yml` | GitHub Actions — security/dependency scanning |
| `deployment/monitoring/alerts.yml` | Prometheus alerting rules |
| `deployment/monitoring/prometheus.yml` | Prometheus scrape configuration |
| `deployment/nginx/careerguidance.conf` | Production NGINX server block (domain-specific) |
| `deployment/nginx/frontend.conf` | Container-internal NGINX config for frontend image |
| `deployment/nginx/nginx.conf` | Production NGINX configuration (SSL, HSTS, rate limits) |
| `deployment/nginx/nginx.dev.conf` | Development NGINX configuration (no SSL, Vite HMR proxy) |
| `deployment/railway/nixpacks.backend.toml` | Nixpacks build configuration for Railway backend |
| `deployment/railway/railway-setup.sh` | Railway CLI service-setup script |
| `deployment/railway/railway.json` | Railway service definitions |
| `deployment/render/render.yaml` | Render Blueprint — 4 service definitions |
| `deployment/scripts/mongo-init.js` | MongoDB container initialization script |
| `deployment/scripts/start-dev.sh` | Local development startup helper script |

### schemas (9 files)

| File | Purpose |
|---|---|
| `schemas/Assessment.model.js` | Legacy reference Mongoose model (unused — backend has its own copies) |
| `schemas/AuditLog.model.js` | Legacy reference Mongoose model (unused — backend has its own copies) |
| `schemas/Notification.model.js` | Legacy reference Mongoose model (unused — backend has its own copies) |
| `schemas/Permission.model.js` | Legacy reference Mongoose model (unused — backend has its own copies) |
| `schemas/Psychologist.model.js` | Legacy reference Mongoose model (unused — backend has its own copies) |
| `schemas/Report.model.js` | Legacy reference Mongoose model (unused — backend has its own copies) |
| `schemas/User.model.js` | Legacy reference Mongoose model (unused — backend has its own copies) |
| `schemas/index.js` | Legacy reference model bootstrap (unused) |
| `schemas/package.json` | npm package manifest — dependencies and scripts |
