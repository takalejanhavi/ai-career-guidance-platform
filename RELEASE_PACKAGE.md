# RELEASE_PACKAGE.md
## AI Career Guidance Platform — v1.0.0 Release Package

---

## 1. Exact Folder Structure

```
career-guidance-platform/
├── .env.example
├── .gitignore
├── docker-compose.yml
├── README.md
├── LICENSE
├── CONTRIBUTING.md
├── DEPLOYMENT_EXECUTION_GUIDE.md
├── RELEASE_MANIFEST.md
├── FINAL_REPOSITORY.md
├── FINAL_BUILD_CHECKLIST.md
├── RELEASE_PACKAGE.md
├── ZIP_READY_REPORT.md
│
├── frontend/
│   ├── src/{animations,components,hooks,pages,services,store,utils}/
│   ├── index.html, vite.config.js, tailwind.config.js, postcss.config.js
│   ├── package.json, package-lock.json, Dockerfile
│   └── .env.example, .gitignore
│
├── backend/
│   ├── src/{config,jobs,middleware,modules,scripts,services,utils}/
│   ├── tests/{unit,integration}/
│   ├── docs/
│   ├── package.json, package-lock.json, Dockerfile, docker-compose.yml
│   └── .env.example, .gitignore, .dockerignore
│
├── ai-service/
│   ├── api/, models/, utils/, tests/
│   ├── requirements.txt, Dockerfile, wsgi.py, gunicorn.conf.py
│   └── .env.example, .gitignore, .dockerignore
│
├── blockchain/
│   ├── contracts/, scripts/, test/, src/
│   ├── hardhat.config.js, package.json, package-lock.json, Dockerfile.hardhat
│   └── .env.example, .gitignore
│
├── pdf-service/                    (reference only — canonical copy in backend/src/services/pdf/)
│   ├── src/{generators,utils}/, tests/
│   ├── package.json, package-lock.json
│   └── .gitignore, .env.example
│
├── schemas/                          (legacy reference — unused)
│
└── deployment/
    ├── dockerfiles/{Dockerfile.ai,Dockerfile.backend,Dockerfile.frontend}
    ├── docker-compose.yml, docker-compose.prod.yml
    ├── nginx/{nginx.conf,nginx.dev.conf,frontend.conf,careerguidance.conf}
    ├── envs/{.env.development,.env.staging,.env.production}
    ├── github-actions/{ci.yml,cd.yml,security.yml}
    ├── render/render.yaml
    ├── railway/{railway.json,nixpacks.backend.toml,railway-setup.sh}
    ├── monitoring/{prometheus.yml,alerts.yml}
    ├── scripts/{mongo-init.js,start-dev.sh}
    └── GITHUB_SECRETS.md
```

**Excluded from zip** (regenerated/generated at build or runtime): `node_modules/`, `dist/`, `__pycache__/`, `.pytest_cache/`, `ai-service/models/artefacts/`, `blockchain/artifacts/`, `blockchain/cache/`, `backend/logs/`, `*.tar.gz`.

---

## 2. Environment Variables

All variables consolidated in root `.env.example`. Summary by category:

| Category | Variables |
|---|---|
| App | `NODE_ENV`, `PORT`, `APP_NAME`, `FRONTEND_URL`, `LOG_LEVEL` |
| MongoDB | `MONGODB_URI` |
| JWT | `JWT_PRIVATE_KEY`, `JWT_PUBLIC_KEY`, `JWT_ACCESS_EXPIRES`, `JWT_REFRESH_EXPIRES` |
| Redis | `REDIS_URL` |
| AI Service | `AI_SERVICE_URL`, `AI_SERVICE_SECRET`, `ALLOWED_ORIGINS`, `MODEL_VERSION` |
| Email | `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `EMAIL_FROM` |
| Storage | `S3_ENDPOINT`, `S3_BUCKET`, `S3_REGION`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`, `S3_SIGNED_URL_EXPIRES` |
| Blockchain | `BLOCKCHAIN_RPC_URL`, `BLOCKCHAIN_PRIVATE_KEY`, `CONTRACT_ADDRESS`, `BLOCKCHAIN_NETWORK` |
| Rate Limiting | `RATE_LIMIT_WINDOW_MS`, `RATE_LIMIT_MAX`, `AUTH_RATE_LIMIT_MAX` |
| Frontend | `VITE_API_URL`, `VITE_APP_NAME`, `VITE_APP_VERSION`, `VITE_APP_ENV` |

---

## 3. Startup Commands (Local, No Docker)

```bash
# 1. AI service
cd ai-service
pip install -r requirements.txt --break-system-packages
python models/train.py --no-tune
python -m flask --app api.app run --port 5050

# 2. Backend (new terminal)
cd backend
npm install
cp .env.example .env   # edit: MONGODB_URI, JWT_*, AI_SERVICE_URL=http://localhost:5050
npm run indexes
npm run seed
npm run dev

# 3. Frontend (new terminal)
cd frontend
npm install
npm run dev

# 4. Blockchain (optional, new terminal)
cd blockchain
npm install
npx hardhat node
# separate terminal:
npx hardhat run scripts/deploy.js --network localhost
```

---

## 4. Docker Commands

```bash
# From repo root
cp deployment/envs/.env.development .env
# edit .env: MONGODB_URI -> Atlas connection string

docker compose --project-directory . -f deployment/docker-compose.yml config --quiet
docker compose --project-directory . -f deployment/docker-compose.yml build
docker compose --project-directory . -f deployment/docker-compose.yml up -d
docker compose --project-directory . -f deployment/docker-compose.yml ps

# Migrations + seed
docker compose --project-directory . -f deployment/docker-compose.yml exec backend npm run indexes
docker compose --project-directory . -f deployment/docker-compose.yml exec backend npm run seed

# Teardown
docker compose --project-directory . -f deployment/docker-compose.yml down
docker compose --project-directory . -f deployment/docker-compose.yml down -v   # also remove volumes
```

Production overlay:
```bash
docker compose --project-directory . -f deployment/docker-compose.yml -f deployment/docker-compose.prod.yml up -d
```

---

## 5. Deployment Commands

### Render

```bash
# render.yaml is auto-detected when the repo is connected via the Render dashboard.
# Manual blueprint apply (Render CLI):
render blueprint launch --file deployment/render/render.yaml
```
Populate `sync: false` secrets (JWT keys, MONGODB_URI, AI_SERVICE_SECRET, BLOCKCHAIN_*, SMTP_*, S3_*) in the Render dashboard for each of the 4 services (`cgp-backend`, `cgp-frontend`, `cgp-ai-service`, `cgp-redis`).

### Railway

```bash
bash deployment/railway/railway-setup.sh
```
This script creates services per `deployment/railway/railway.json` and applies `deployment/railway/nixpacks.backend.toml` for the backend build. Set environment variables via `railway variables set KEY=VALUE` for each service, or via the Railway dashboard.

---

## 6. MongoDB Atlas Setup

```bash
atlas clusters create cgp-cluster --provider AWS --region US_EAST_1 --tier M0
atlas dbusers create --username cgp_app --password "<STRONG_PASSWORD>" --role readWriteAnyDatabase@admin
atlas accessLists create --currentIp
atlas clusters connectionStrings describe cgp-cluster
```
Set the returned `mongodb+srv://...` string as `MONGODB_URI`. Then:
```bash
npm run indexes   # (inside backend/, or via docker compose exec backend npm run indexes)
npm run seed      # development only — creates 4 demo users
```

---

## 7. Hardhat Setup

```bash
cd blockchain
npm install
npx hardhat compile

# Local node (separate terminal, keep running)
npx hardhat node

# Deploy
npx hardhat run scripts/deploy.js --network localhost
# -> prints deployed CareerReport address; set as CONTRACT_ADDRESS

# Set BLOCKCHAIN_RPC_URL=http://localhost:8545 (or http://hardhat_node:8545 in Docker)
# Set BLOCKCHAIN_PRIVATE_KEY to one of Hardhat's printed dev-account keys
#   (account #0: 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80 — LOCAL ONLY)

# Run contract + integration tests
npm test
```

For testnet deployment (Polygon Mumbai):
```bash
npx hardhat run scripts/deploy.js --network polygon_mumbai
```
Requires `MUMBAI_RPC_URL` and `DEPLOYER_PRIVATE_KEY` set in `blockchain/.env` (a funded testnet wallet).
