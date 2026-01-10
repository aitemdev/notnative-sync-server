#!/bin/bash

# NotNative VPS Server - Docker Deployment Script
# Usage: ./deploy-docker.sh

set -e

echo "🐳 Starting Docker deployment..."

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

APP_DIR="$HOME/notnative-sync-server" # Adjust if needed, user seems to be in ~/notnative-sync-server based on logs
# User logs: ubuntu@vps-0990c918:~/notnative-sync-server$

echo -e "${YELLOW}1. Pulling latest code...${NC}"
git pull origin main

echo -e "${YELLOW}2. Building and restarting containers...${NC}"
docker compose down
docker compose build --no-cache
docker compose up -d

echo -e "${YELLOW}3. Running database migrations...${NC}"
echo -e "  - Adding favorites columns..."
docker compose exec -T server npm run migrate:add-favorites || echo -e "${YELLOW}⚠️  Migration already applied or failed${NC}"

echo -e "${YELLOW}4. Pruning unused images...${NC}"
docker image prune -f

echo -e "${YELLOW}5. Showing logs (Ctrl+C to exit)...${NC}"
docker compose logs -f
