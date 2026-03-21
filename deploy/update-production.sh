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

echo -e "${YELLOW}[1/9] Pulling latest changes from GitHub...${NC}"
git pull origin main

echo -e "${YELLOW}[2/9] Updating Python dependencies...${NC}"
sudo -u svr /var/www/svr/venv/bin/pip install -r requirements.txt

echo -e "${YELLOW}[3/9] Running database migrations...${NC}"
sudo -u svr /var/www/svr/venv/bin/python manage.py migrate

echo -e "${YELLOW}[4/9] Collecting static files...${NC}"
sudo -u svr /var/www/svr/venv/bin/python manage.py collectstatic --noinput

echo -e "${YELLOW}[5/9] Initializing and seeding system data...${NC}"
# Core initialization
sudo -u svr /var/www/svr/venv/bin/python manage.py init_permissions
sudo -u svr /var/www/svr/venv/bin/python manage.py init_settings
sudo -u svr /var/www/svr/venv/bin/python manage.py seed_modules
sudo -u svr /var/www/svr/venv/bin/python manage.py create_super_admin

# Module-specific data
sudo -u svr /var/www/svr/venv/bin/python manage.py init_service_types
sudo -u svr /var/www/svr/venv/bin/python manage.py seed_aa_membership
sudo -u svr /var/www/svr/venv/bin/python manage.py seed_leave_types
sudo -u svr /var/www/svr/venv/bin/python manage.py populate_comprehensive_code_library
sudo -u svr /var/www/svr/venv/bin/python manage.py sync_code_library --limit 50
sudo -u svr /var/www/svr/venv/bin/python manage.py create_all_email_templates
sudo -u svr /var/www/svr/venv/bin/python manage.py setup_invoice_email_templates
sudo -u svr /var/www/svr/venv/bin/python manage.py create_inspection_templates

echo -e "${YELLOW}[6/9] Updating frontend dependencies...${NC}"
cd /var/www/svr/frontend
sudo -u svr npm install

echo -e "${YELLOW}[7/9] Building frontend...${NC}"
sudo -u svr npm run build
cd /opt/smart_vehicle_repairs_system

echo -e "${YELLOW}[8/9] Restarting services...${NC}"
sudo systemctl restart svr
sudo systemctl restart svr-celery
sudo systemctl restart svr-celerybeat
sudo systemctl restart svr-nextjs
sudo systemctl restart nginx

echo -e "${YELLOW}[9/9] Checking service status...${NC}"
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
