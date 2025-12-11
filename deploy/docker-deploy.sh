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

if ! command -v docker-compose &> /dev/null; then
    echo -e "${RED}Docker Compose is not installed!${NC}"
    exit 1
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
docker-compose build

# Start services
echo -e "${YELLOW}Starting services...${NC}"
docker-compose up -d

# Wait for database to be ready
echo -e "${YELLOW}Waiting for database...${NC}"
sleep 10

# Run migrations
echo -e "${YELLOW}Running migrations...${NC}"
docker-compose exec -T backend python manage.py migrate

# Initialize permissions
echo -e "${YELLOW}Initializing permissions...${NC}"
docker-compose exec -T backend python manage.py init_permissions || echo "Already initialized"

# Initialize settings
echo -e "${YELLOW}Initializing settings...${NC}"
docker-compose exec -T backend python manage.py init_settings || echo "Already initialized"

# Collect static files
echo -e "${YELLOW}Collecting static files...${NC}"
docker-compose exec -T backend python manage.py collectstatic --noinput

echo ""
echo -e "${GREEN}=========================================="
echo "Deployment Complete!"
echo "==========================================${NC}"
echo ""
echo "Services running:"
docker-compose ps
echo ""
echo "Next steps:"
echo "1. Create superuser: docker-compose exec backend python manage.py createsuperuser"
echo "2. Setup SSL certificates"
echo "3. Update Nginx domains in deploy/nginx/default.conf"
echo "4. Test: curl http://localhost:8000/api/health/"
echo ""
echo "View logs: docker-compose logs -f"
echo "Restart: docker-compose restart"
echo ""

