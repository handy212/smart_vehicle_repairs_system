#!/bin/bash

###############################################################################
# Quick Docker Deployment Script
# Run with: bash deploy/docker-deploy.sh
###############################################################################

set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${GREEN}=========================================="
echo "Docker Deployment Script"
echo "==========================================${NC}"
echo ""

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    echo -e "${RED}Docker is not installed!${NC}"
    echo "Install with: curl -fsSL https://get.docker.com | sh"
    exit 1
fi

# Check for docker compose (plugin) or docker-compose (standalone)
if ! docker compose version &> /dev/null && ! command -v docker-compose &> /dev/null; then
    echo -e "${RED}Docker Compose is not installed!${NC}"
    exit 1
fi

# Use docker compose plugin if available, otherwise docker-compose
if docker compose version &> /dev/null; then
    DOCKER_COMPOSE="docker compose"
else
    DOCKER_COMPOSE="docker-compose"
fi

# Check if .env.production exists
if [ ! -f ".env.production" ]; then
    echo -e "${YELLOW}Creating .env.production from example...${NC}"
    cp .env.production.example .env.production
    echo -e "${YELLOW}Please edit .env.production with your settings!${NC}"
    echo "Press Enter to continue after editing..."
    read
fi

# Pull latest code (if git repo)
if [ -d ".git" ]; then
    echo -e "${YELLOW}Pulling latest code...${NC}"
    git pull || echo "Not a git repository or pull failed"
fi

# Build images
echo -e "${YELLOW}Building Docker images...${NC}"
$DOCKER_COMPOSE build

# Start services
echo -e "${YELLOW}Starting services...${NC}"
$DOCKER_COMPOSE up -d

# Wait for database to be ready
echo -e "${YELLOW}Waiting for database...${NC}"
sleep 10

# Run migrations
echo -e "${YELLOW}Running migrations...${NC}"
$DOCKER_COMPOSE exec -T backend python manage.py migrate

# Initialize permissions
echo -e "${YELLOW}Initializing permissions...${NC}"
$DOCKER_COMPOSE exec -T backend python manage.py init_permissions || echo "Already initialized"

# Initialize settings
echo -e "${YELLOW}Initializing settings...${NC}"
$DOCKER_COMPOSE exec -T backend python manage.py init_settings || echo "Already initialized"

# Collect static files
echo -e "${YELLOW}Collecting static files...${NC}"
$DOCKER_COMPOSE exec -T backend python manage.py collectstatic --noinput

echo ""
echo -e "${GREEN}=========================================="
echo "Deployment Complete!"
echo "==========================================${NC}"
echo ""
echo "Services running:"
$DOCKER_COMPOSE ps
echo ""
echo "Next steps:"
echo "1. Create superuser: $DOCKER_COMPOSE exec backend python manage.py createsuperuser"
echo "2. Setup SSL certificates"
echo "3. Update Nginx domains in deploy/nginx/default.conf"
echo "4. Test: curl http://localhost:8000/api/health/"
echo ""
echo "View logs: $DOCKER_COMPOSE logs -f"
echo "Restart: $DOCKER_COMPOSE restart"
echo ""

