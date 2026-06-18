#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────
# railway-setup.sh — Railway.app Project Setup Script
#
# Prerequisites:
#   - Railway CLI installed: npm install -g @railway/cli
#   - Logged in: railway login
#   - Project created: railway init
#
# Usage: bash deployment/railway/railway-setup.sh [staging|production]
# ──────────────────────────────────────────────────────────────────

set -euo pipefail

ENV=${1:-staging}
echo ""
echo "═══════════════════════════════════════════════════════"
echo "  CareerAI — Railway Setup: $ENV"
echo "═══════════════════════════════════════════════════════"
echo ""

# ── Check prerequisites ───────────────────────────────────────────
command -v railway &>/dev/null || { echo "ERROR: railway CLI not found. Run: npm i -g @railway/cli"; exit 1; }

railway whoami || { echo "ERROR: Not logged in. Run: railway login"; exit 1; }

# ── Create services ───────────────────────────────────────────────
echo "[1/6] Creating Railway services..."

railway service create --name cgp-backend
railway service create --name cgp-frontend
railway service create --name cgp-ai-service
railway service create --name cgp-worker

echo "✓ Services created"

# ── Add managed databases ─────────────────────────────────────────
echo "[2/6] Provisioning managed databases..."

# Railway managed MongoDB (via Atlas plugin or MongoDB Compass)
# Note: Railway uses MongoDB Atlas integration
railway add --plugin mongodb --service cgp-backend
railway add --plugin redis    --service cgp-backend

echo "✓ Databases provisioned"

# ── Set backend environment variables ─────────────────────────────
echo "[3/6] Setting backend environment variables..."

railway variables set \
  --service cgp-backend \
  NODE_ENV=production \
  PORT=4000 \
  JWT_ACCESS_EXPIRES=15m \
  JWT_REFRESH_EXPIRES=7d \
  SMTP_HOST=smtp.resend.com \
  SMTP_PORT=465 \
  SMTP_USER=resend \
  EMAIL_FROM="CareerAI <noreply@careerguidance.app>" \
  S3_ENDPOINT=https://s3.amazonaws.com \
  S3_BUCKET="career-guidance-reports-${ENV}" \
  S3_REGION=us-east-1 \
  BLOCKCHAIN_NETWORK="${ENV == 'production' && 'polygon' || 'polygon-mumbai'}" \
  FRONTEND_URL="${ENV == 'production' && 'https://careerguidance.app' || 'https://staging.careerguidance.app'}" \
  RATE_LIMIT_MAX="${ENV == 'production' && '100' || '500'}" \
  AUTH_RATE_LIMIT_MAX="${ENV == 'production' && '10' || '50'}" \
  LOG_LEVEL=info

echo "  ⚠  You must set these secrets manually in the Railway dashboard:"
echo "     MONGODB_URI, JWT_PRIVATE_KEY, JWT_PUBLIC_KEY"
echo "     AI_SERVICE_SECRET, SMTP_PASS"
echo "     S3_ACCESS_KEY, S3_SECRET_KEY"
echo "     BLOCKCHAIN_RPC_URL, BLOCKCHAIN_PRIVATE_KEY, CONTRACT_ADDRESS"

# ── Set frontend environment variables ────────────────────────────
echo "[4/6] Setting frontend environment variables..."

if [ "$ENV" = "production" ]; then
  API_URL="https://api.careerguidance.app"
else
  API_URL="https://cgp-backend-staging.up.railway.app"
fi

railway variables set \
  --service cgp-frontend \
  VITE_API_URL="${API_URL}" \
  VITE_APP_ENV="${ENV}"

# ── Set AI service environment variables ──────────────────────────
echo "[5/6] Setting AI service environment variables..."

railway variables set \
  --service cgp-ai-service \
  PORT=5050 \
  FLASK_DEBUG=false \
  WORKERS=2 \
  THREADS=4 \
  TIMEOUT=120

echo "  ⚠  Set AI_SERVICE_SECRET manually in Railway dashboard"

# ── Link services ─────────────────────────────────────────────────
echo "[6/6] Linking services..."

# Worker shares same env as backend
railway service link cgp-worker cgp-backend --share-env

echo ""
echo "═══════════════════════════════════════════════════════"
echo "  Setup complete! Next steps:"
echo "═══════════════════════════════════════════════════════"
echo ""
echo "  1. Set secret values in Railway dashboard:"
echo "     https://railway.app/project/<your-project>/settings"
echo ""
echo "  2. Set Dockerfile paths for each service:"
echo "     Backend:    deployment/dockerfiles/Dockerfile.backend"
echo "     Frontend:   deployment/dockerfiles/Dockerfile.frontend"
echo "     AI Service: deployment/dockerfiles/Dockerfile.ai"
echo ""
echo "  3. Deploy services:"
echo "     railway up --service cgp-backend"
echo "     railway up --service cgp-ai-service"
echo "     railway up --service cgp-frontend"
echo "     railway up --service cgp-worker"
echo ""
echo "  4. Set custom domains in Railway dashboard"
echo ""
