# AI Career Guidance Platform

An AI-powered career guidance platform: students take a 29-question psychometric assessment, receive AI-generated career recommendations with a confidence-scored narrative, download a branded PDF report, and optionally anchor the report's hash on a blockchain for tamper-proof verification.

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18, Vite, Tailwind CSS, Framer Motion, React Query, Zustand |
| Backend | Node.js 20, Express 5, MongoDB (Atlas), JWT (RS256), RBAC |
| AI Service | Python 3.11, Flask, scikit-learn, XGBoost, pandas, NumPy |
| PDF Service | PDFKit (vector charts via custom drawing primitives) |
| Blockchain | Solidity, Hardhat, ethers.js v6 |
| Infrastructure | Docker, Docker Compose, NGINX, Redis, MinIO/S3 |
| CI/CD & Hosting | GitHub Actions, Render, Railway |

## Repository Structure

```
frontend/      React SPA
backend/       Express API + Bull workers
ai-service/    Flask ML inference service
blockchain/    Solidity contracts + Hardhat
pdf-service/   Reference PDF generator (canonical copy in backend/src/services/pdf/)
schemas/       Legacy reference models (unused)
deployment/    Docker, NGINX, CI/CD, Render/Railway configs
```

## Quick Start (Docker — recommended)

```bash
cp deployment/envs/.env.development .env
# Edit .env: set MONGODB_URI to your MongoDB Atlas connection string

docker compose -f deployment/docker-compose.yml up -d
docker compose -f deployment/docker-compose.yml exec backend npm run indexes
docker compose -f deployment/docker-compose.yml exec backend npm run seed
```

Then visit:
- Frontend: http://localhost
- Backend API: http://localhost:4000/api/v1
- AI service: http://localhost:5050
- MailHog (dev email): http://localhost:8025
- MinIO console: http://localhost:9001

Demo accounts (created by `npm run seed`):
| Role | Email | Password |
|---|---|---|
| Admin | admin@demo.com | Admin@1234! |
| Psychologist | psychologist@demo.com | Psych@1234! |
| Student | student@demo.com | Student@1234! |
| Student | student2@demo.com | Student@1234! |

For the full step-by-step walkthrough (Atlas setup, Hardhat deployment, end-to-end testing of every feature), see `DEPLOYMENT_EXECUTION_GUIDE.md`.

## Quick Start (Local, without Docker)

Requires Node.js 20.x, Python 3.11, MongoDB Atlas access, Redis.

```bash
# AI service
cd ai-service && pip install -r requirements.txt --break-system-packages
python models/train.py --no-tune
python -m flask --app api.app run --port 5050

# Backend (new terminal)
cd backend && npm install
cp .env.example .env   # fill in MONGODB_URI, JWT keys, AI_SERVICE_URL=http://localhost:5050, etc.
npm run dev

# Frontend (new terminal)
cd frontend && npm install
npm run dev
```

## Scripts Reference

| Service | Command | Purpose |
|---|---|---|
| backend | `npm run dev` | Start with nodemon |
| backend | `npm test` | Run Jest unit + integration tests |
| backend | `npm run indexes` | Create MongoDB indexes |
| backend | `npm run seed` | Seed 4 demo users (development only) |
| frontend | `npm run dev` | Start Vite dev server |
| frontend | `npm run build` | Production build to `dist/` |
| ai-service | `python models/train.py` | Train the ensemble model |
| ai-service | `pytest` | Run AI service test suite |
| blockchain | `npm run compile` | Compile Solidity contracts |
| blockchain | `npm run test` | Run Hardhat contract tests |
| blockchain | `npm run node` | Start local Hardhat node |
| blockchain | `npm run deploy:local` | Deploy contracts to local node |

## Documentation

- `DEPLOYMENT_EXECUTION_GUIDE.md` — full step-by-step deployment walkthrough
- `RELEASE_PACKAGE.md` — environment variables, folder structure, all deployment commands
- `backend/docs/` — AI integration, PDF architecture, and API contract reference docs

## License

See `LICENSE`.
