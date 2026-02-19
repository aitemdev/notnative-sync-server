#!/usr/bin/env bash

# NotNative VPS Server - Docker Deployment Script
# Usage:
#   ./deploy-docker.sh
#   ./deploy-docker.sh <branch>

set -Eeuo pipefail

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

BRANCH="${1:-main}"
APP_SERVICE="${APP_SERVICE:-app}"
HEALTH_URL="${HEALTH_URL:-http://localhost:3000/health}"
MAX_HEALTH_RETRIES="${MAX_HEALTH_RETRIES:-30}"
HEALTH_SLEEP_SECONDS="${HEALTH_SLEEP_SECONDS:-2}"
RUN_VERIFY="${RUN_VERIFY:-0}"
VERIFY_URL="${VERIFY_URL:-http://51.91.159.103:3000}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

on_error() {
	local exit_code=$?
	echo -e "${RED}❌ Deployment failed (exit ${exit_code}) at line ${BASH_LINENO[0]}${NC}"
	echo -e "${YELLOW}ℹ️ Recent compose status:${NC}"
	docker compose ps || true
	exit "$exit_code"
}
trap on_error ERR

require_cmd() {
	if ! command -v "$1" >/dev/null 2>&1; then
		echo -e "${RED}❌ Required command not found: $1${NC}"
		exit 1
	fi
}

echo -e "${YELLOW}🐳 Starting Docker deployment (branch: ${BRANCH})...${NC}"

require_cmd git
require_cmd docker
require_cmd curl

echo -e "${YELLOW}1) Validating working tree...${NC}"
git rev-parse --is-inside-work-tree >/dev/null

echo -e "${YELLOW}2) Pulling latest code...${NC}"
git fetch origin "$BRANCH"
git checkout "$BRANCH"
git pull --ff-only origin "$BRANCH"

echo -e "${YELLOW}3) Rebuilding and restarting containers...${NC}"
docker compose down
docker compose build --pull
docker compose up -d

echo -e "${YELLOW}4) Running migrations inside ${APP_SERVICE}...${NC}"
docker compose exec -T "$APP_SERVICE" npm run migrate

echo -e "${YELLOW}5) Running additive migrations (idempotent)...${NC}"
docker compose exec -T "$APP_SERVICE" npm run migrate:add-favorites || echo -e "${YELLOW}⚠️ migrate:add-favorites skipped/previously applied${NC}"
docker compose exec -T "$APP_SERVICE" npm run migrate:add-deleted-at || echo -e "${YELLOW}⚠️ migrate:add-deleted-at skipped/previously applied${NC}"

echo -e "${YELLOW}6) Waiting for health endpoint: ${HEALTH_URL}${NC}"
attempt=1
until curl -fsS "$HEALTH_URL" >/dev/null; do
	if [ "$attempt" -ge "$MAX_HEALTH_RETRIES" ]; then
		echo -e "${RED}❌ Health check failed after ${MAX_HEALTH_RETRIES} attempts${NC}"
		docker compose logs --tail=200 "$APP_SERVICE" || true
		exit 1
	fi
	sleep "$HEALTH_SLEEP_SECONDS"
	attempt=$((attempt + 1))
done

echo -e "${YELLOW}7) Final status...${NC}"
docker compose ps

echo -e "${YELLOW}8) Pruning dangling images...${NC}"
docker image prune -f >/dev/null || true

echo -e "${GREEN}✅ Deployment completed successfully${NC}"
echo -e "${GREEN}✅ Health check passed: ${HEALTH_URL}${NC}"

echo -e "${YELLOW}📄 Last 80 log lines (${APP_SERVICE}):${NC}"
docker compose logs --tail=80 "$APP_SERVICE"

if [ "$RUN_VERIFY" = "1" ]; then
	echo -e "${YELLOW}9) Running post-deploy sync verification against ${VERIFY_URL}...${NC}"
	"$SCRIPT_DIR/../scripts/post-deploy-verify.sh" "$VERIFY_URL"
	echo -e "${GREEN}✅ Post-deploy verification passed${NC}"
fi
