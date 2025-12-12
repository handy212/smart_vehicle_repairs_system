#!/bin/bash
###############################################################################
# Smart Vehicle Repairs System - Production Update Script
# Run with: sudo bash deploy/update-production.sh
###############################################################################

set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${GREEN}=========================================="
echo "Smart Vehicle Repairs - Production Update"
echo -e "==========================================${NC}"
echo ""

# Check if running as root
if [ "$EUID" -ne 0 ]; then
    echo -e "${RED}Please run as root (use sudo)${NC}"
    exit 1
fi

# Navigate to project directory
if [ -d "/opt/smart_vehicle_repairs_system" ]; then
    cd /opt/smart_vehicle_repairs_system
else
    echo -e "${RED}Project directory not found: /opt/smart_vehicle_repairs_system${NC}"
    exit 1
fi

echo -e "${YELLOW}[1/8] Pulling latest changes from GitHub...${NC}"
git pull origin main

echo -e "${YELLOW}[2/8] Updating Python dependencies...${NC}"
sudo -u svr /var/www/svr/venv/bin/pip install -r requirements.txt

echo -e "${YELLOW}[3/8] Running database migrations...${NC}"
sudo -u svr /var/www/svr/venv/bin/python manage.py migrate

echo -e "${YELLOW}[4/8] Collecting static files...${NC}"
sudo -u svr /var/www/svr/venv/bin/python manage.py collectstatic --noinput

echo -e "${YELLOW}[5/8] Updating frontend dependencies...${NC}"
cd /var/www/svr/frontend
sudo -u svr npm install

echo -e "${YELLOW}[6/8] Building frontend...${NC}"
sudo -u svr npm run build
cd /opt/smart_vehicle_repairs_system

echo -e "${YELLOW}[7/8] Restarting services...${NC}"
sudo systemctl restart svr
sudo systemctl restart svr-celery
sudo systemctl restart svr-celerybeat
sudo systemctl restart svr-nextjs
sudo systemctl restart nginx

echo -e "${YELLOW}[8/8] Checking service status...${NC}"
echo ""
echo -e "${GREEN}Service Status:${NC}"
sudo systemctl status svr svr-celery svr-celerybeat svr-nextjs nginx --no-pager -l

echo ""
echo -e "${GREEN}=========================================="
echo "Production Update Complete!"
echo -e "==========================================${NC}"
echo ""
echo "Update completed successfully!"
echo "Check your application at: https://yourdomain.com"
echo ""
echo "Monitor logs with:"
echo "  sudo tail -f /var/www/svr/logs/production.log"
echo "  sudo journalctl -u svr -f"
