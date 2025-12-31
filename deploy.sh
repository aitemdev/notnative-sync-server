#!/bin/bash

# NotNative VPS Server - Deployment Script
# Usage: ./deploy.sh

set -e  # Exit on error

echo "🚀 Starting deployment..."

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Configuration
APP_NAME="notnative-sync"
APP_DIR="$HOME/notnative-sync"
BRANCH="main"

echo -e "${YELLOW}1. Pulling latest code...${NC}"
cd $APP_DIR
git pull origin $BRANCH

echo -e "${YELLOW}2. Installing dependencies...${NC}"
npm ci --only=production

echo -e "${YELLOW}3. Building application...${NC}"
npm run build

echo -e "${YELLOW}4. Running migrations...${NC}"
npm run migrate

echo -e "${YELLOW}5. Restarting PM2 process...${NC}"
pm2 restart $APP_NAME

echo -e "${YELLOW}6. Checking status...${NC}"
pm2 status $APP_NAME

echo -e "${GREEN}✅ Deployment completed successfully!${NC}"
echo -e "${GREEN}Server is running at http://localhost:3000${NC}"
