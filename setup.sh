#!/bin/bash

# NotNative VPS Server - Initial Setup Script
# Usage: ./setup.sh

set -e

echo "🔧 Setting up NotNative Sync Server on VPS..."

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

# Configuration
APP_NAME="notnative-sync"
APP_DIR="$HOME/notnative-sync"

# Check if PostgreSQL is installed
echo -e "${YELLOW}Checking PostgreSQL...${NC}"
if ! command -v psql &> /dev/null; then
    echo -e "${RED}PostgreSQL not found. Installing...${NC}"
    sudo apt update
    sudo apt install -y postgresql postgresql-contrib
else
    echo -e "${GREEN}PostgreSQL is already installed${NC}"
fi

# Check if Node.js is installed
echo -e "${YELLOW}Checking Node.js...${NC}"
if ! command -v node &> /dev/null; then
    echo -e "${RED}Node.js not found. Please install Node.js 18+ first${NC}"
    exit 1
else
    NODE_VERSION=$(node -v)
    echo -e "${GREEN}Node.js $NODE_VERSION is installed${NC}"
fi

# Check if Python is installed
echo -e "${YELLOW}Checking Python...${NC}"
if ! command -v python3 &> /dev/null; then
    echo -e "${RED}Python 3 not found. Installing...${NC}"
    sudo apt update
    sudo apt install -y python3 python3-pip python3-venv
else
    echo -e "${GREEN}Python 3 is already installed${NC}"
fi

# Install Python libraries
echo -e "${YELLOW}Installing Python libraries (matplotlib, pandas, numpy, pillow)...${NC}"
# Create a virtual environment if it doesn't exist
if [ ! -d "venv" ]; then
    python3 -m venv venv
fi
source venv/bin/activate
pip install matplotlib pandas numpy pillow
deactivate

# Check if PM2 is installed
echo -e "${YELLOW}Checking PM2...${NC}"
if ! command -v pm2 &> /dev/null; then
    echo -e "${YELLOW}Installing PM2...${NC}"
    sudo npm install -g pm2
else
    echo -e "${GREEN}PM2 is already installed${NC}"
fi

# Create database and user
echo -e "${YELLOW}Setting up PostgreSQL database...${NC}"
read -p "Enter PostgreSQL admin password (postgres user): " -s PG_ADMIN_PASS
echo
read -p "Enter new database user password: " -s DB_PASS
echo

sudo -u postgres psql <<EOF
CREATE USER notnative_user WITH PASSWORD '$DB_PASS';
CREATE DATABASE notnative_sync OWNER notnative_user;
GRANT ALL PRIVILEGES ON DATABASE notnative_sync TO notnative_user;
\q
EOF

echo -e "${GREEN}Database created successfully${NC}"

# Clone repository (if not already cloned)
if [ ! -d "$APP_DIR" ]; then
    echo -e "${YELLOW}Cloning repository...${NC}"
    read -p "Enter repository URL: " REPO_URL
    git clone $REPO_URL $APP_DIR
fi

cd $APP_DIR

# Create .env file
echo -e "${YELLOW}Creating .env file...${NC}"
cat > .env <<EOF
NODE_ENV=production
PORT=3000

DB_HOST=localhost
DB_PORT=5432
DB_NAME=notnative_sync
DB_USER=notnative_user
DB_PASSWORD=$DB_PASS

JWT_SECRET=$(openssl rand -base64 32)
JWT_REFRESH_SECRET=$(openssl rand -base64 32)

CORS_ORIGIN=*
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100
EOF

echo -e "${GREEN}.env file created${NC}"

# Install dependencies (including devDependencies for build)
echo -e "${YELLOW}Installing dependencies...${NC}"
npm ci

# Build application
echo -e "${YELLOW}Building application...${NC}"
npm run build

# Run migrations
echo -e "${YELLOW}Running database migrations...${NC}"
npm run migrate

# Remove devDependencies after build (optional, saves space)
echo -e "${YELLOW}Removing devDependencies...${NC}"
npm prune --production

# Start with PM2
echo -e "${YELLOW}Starting application with PM2...${NC}"
pm2 start dist/index.js --name $APP_NAME
pm2 save
pm2 startup

echo -e "${GREEN}✅ Setup completed successfully!${NC}"
echo -e "${GREEN}Server is running on http://localhost:3000${NC}"
echo -e "${YELLOW}Important:${NC}"
echo -e "  1. Configure your firewall to allow port 3000"
echo -e "  2. Set up Nginx as reverse proxy (optional but recommended)"
echo -e "  3. Configure SSL with Let's Encrypt"
echo -e "  4. Update CORS_ORIGIN in .env to your domain"
echo -e ""
echo -e "PM2 Commands:"
echo -e "  pm2 status          - Check status"
echo -e "  pm2 logs $APP_NAME  - View logs"
echo -e "  pm2 restart $APP_NAME - Restart server"
