#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────
# start-dev.sh — Start complete development stack
# Usage: bash deployment/scripts/start-dev.sh [up|down|restart|logs|status]
# ──────────────────────────────────────────────────────────────────

set -euo pipefail

COMPOSE="docker compose -f deployment/docker-compose.yml"
CMD=${1:-up}

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
BLUE='\033[0;34m'; NC='\033[0m'; BOLD='\033[1m'

header() { echo -e "\n${BOLD}${BLUE}$1${NC}\n"; }
ok()     { echo -e "  ${GREEN}✓${NC} $1"; }
warn()   { echo -e "  ${YELLOW}⚠${NC}  $1"; }
error()  { echo -e "  ${RED}✗${NC} $1"; }

case "$CMD" in

  up)
    header "Starting CareerAI Development Stack"

    # Check prerequisites
    command -v docker &>/dev/null || { error "Docker not found"; exit 1; }
    command -v docker compose &>/dev/null || { error "Docker Compose not found"; exit 1; }

    # Check for .env file
    if [ ! -f "deployment/envs/.env.development" ]; then
      warn ".env.development not found — using defaults (some features may not work)"
    fi

    # Pull latest base images
    echo "Pulling latest images..."
    $COMPOSE pull --quiet mongo redis mailhog minio nginx 2>/dev/null || true

    # Start all services
    echo "Starting services..."
    $COMPOSE up -d --build --remove-orphans

    # Wait for critical services
    echo ""
    echo "Waiting for services to be healthy..."
    SERVICES=(mongo redis backend)
    for svc in "${SERVICES[@]}"; do
      echo -n "  Waiting for $svc..."
      for i in $(seq 1 30); do
        STATUS=$($COMPOSE ps -q "$svc" 2>/dev/null | head -1)
        if [ -n "$STATUS" ]; then
          HEALTH=$(docker inspect --format='{{.State.Health.Status}}' "$STATUS" 2>/dev/null || echo "unknown")
          if [ "$HEALTH" = "healthy" ] || [ "$HEALTH" = "unknown" ]; then
            echo -e " ${GREEN}✓${NC}"
            break
          fi
        fi
        echo -n "."
        sleep 2
        if [ "$i" = "30" ]; then echo -e " ${YELLOW}timeout${NC}"; fi
      done
    done

    echo ""
    header "Development stack is ready!"
    echo "  Frontend       http://localhost:5173"
    echo "  Backend API    http://localhost:4000"
    echo "  AI Service     http://localhost:5050"
    echo "  MongoDB        mongodb://localhost:27017"
    echo "  Redis          redis://localhost:6379"
    echo "  MailHog UI     http://localhost:8025"
    echo "  MinIO Console  http://localhost:9001  (minioadmin/minioadmin)"
    echo "  Blockchain     http://localhost:8545"
    echo ""
    echo "  View logs:     bash deployment/scripts/start-dev.sh logs"
    echo "  Stop all:      bash deployment/scripts/start-dev.sh down"
    ;;

  down)
    header "Stopping Development Stack"
    $COMPOSE down
    ok "All services stopped"
    ;;

  restart)
    header "Restarting Development Stack"
    $COMPOSE down
    $COMPOSE up -d --build
    ok "Stack restarted"
    ;;

  logs)
    SERVICE=${2:-}
    if [ -n "$SERVICE" ]; then
      $COMPOSE logs -f "$SERVICE"
    else
      $COMPOSE logs -f
    fi
    ;;

  status)
    header "Service Status"
    $COMPOSE ps
    ;;

  health)
    header "Health Checks"
    SERVICES=(
      "Backend API:http://localhost:4000/healthz"
      "AI Service:http://localhost:5050/healthz"
      "Frontend:http://localhost:5173"
      "MinIO:http://localhost:9000/minio/health/live"
    )
    for entry in "${SERVICES[@]}"; do
      name="${entry%%:*}"
      url="${entry#*:}"
      STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$url" 2>/dev/null || echo "000")
      if [ "$STATUS" = "200" ]; then
        ok "$name (HTTP $STATUS)"
      else
        error "$name (HTTP $STATUS)"
      fi
    done
    ;;

  clean)
    header "Cleaning up Docker resources"
    warn "This will remove all containers, volumes, and images for this project!"
    read -p "  Continue? [y/N] " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
      $COMPOSE down -v --rmi local --remove-orphans
      ok "Cleanup complete"
    else
      echo "Aborted"
    fi
    ;;

  seed)
    header "Seeding database with demo data"
    $COMPOSE exec backend node src/scripts/seed.js
    ok "Database seeded"
    ;;

  *)
    echo "Usage: $0 {up|down|restart|logs [service]|status|health|clean|seed}"
    exit 1
    ;;
esac
