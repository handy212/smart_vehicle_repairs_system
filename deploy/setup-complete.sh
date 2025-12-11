#!/bin/bash

###############################################################################
# Complete Setup Script - Runs all setup scripts in sequence
# Run with: sudo bash deploy/setup-complete.sh
###############################################################################

set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${GREEN}=========================================="
echo "Complete Setup Script"
echo "==========================================${NC}"
echo ""

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Check if scripts exist
if [ ! -f "$SCRIPT_DIR/install.sh" ]; then
    echo "Please run this script from the project root directory"
    exit 1
fi

# 1. Install dependencies
echo -e "${YELLOW}Step 1: Installing dependencies...${NC}"
bash $SCRIPT_DIR/install.sh

# 2. Setup database (interactive)
echo -e "${YELLOW}Step 2: Setting up database...${NC}"
bash $SCRIPT_DIR/setup-database.sh

# 3. Setup application (interactive for .env)
echo -e "${YELLOW}Step 3: Setting up application...${NC}"
bash $SCRIPT_DIR/setup-app.sh

# 4. Setup services
echo -e "${YELLOW}Step 4: Setting up services...${NC}"
bash $SCRIPT_DIR/setup-services.sh

echo ""
echo -e "${GREEN}=========================================="
echo "Setup Complete!"
echo "==========================================${NC}"
echo ""
echo "Next steps:"
echo "1. Create superuser: sudo -u svr /var/www/svr/venv/bin/python manage.py createsuperuser"
echo "2. Configure Nginx: sudo bash deploy/setup-nginx.sh"
echo "3. Setup SSL: sudo certbot --nginx -d yourdomain.com"
echo "4. Start services: sudo systemctl start svr svr-celery svr-celerybeat"
echo ""

