#!/bin/bash

###############################################################################
# Application Setup Script
# Run with: sudo bash deploy/setup-app.sh
###############################################################################

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

APP_DIR="/var/www/svr"

if [ ! -d "$APP_DIR" ]; then
    echo -e "${RED}Application directory not found: $APP_DIR${NC}"
    echo "Please clone/upload your application first"
    exit 1
fi

echo -e "${GREEN}Setting up application...${NC}"
echo ""

cd $APP_DIR

# Check if .env exists
if [ ! -f ".env" ]; then
    echo -e "${YELLOW}Creating .env file from template...${NC}"
    cat > .env << 'EOF'
# Django Environment
DJANGO_ENVIRONMENT=production
DEBUG=False
SECRET_KEY=CHANGE_THIS_TO_RANDOM_SECRET_KEY
ALLOWED_HOSTS=yourdomain.com,www.yourdomain.com,api.yourdomain.com

# Database
DATABASE_URL=postgresql://svr_user:password@localhost:5432/svr_db

# Redis
REDIS_URL=redis://localhost:6379/0

# Email Configuration
EMAIL_BACKEND=django.core.mail.backends.smtp.EmailBackend
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USE_TLS=True
EMAIL_HOST_USER=
EMAIL_HOST_PASSWORD=

# CORS
CORS_ALLOWED_ORIGINS=https://yourdomain.com,https://www.yourdomain.com

# JWT Tokens
JWT_ACCESS_TOKEN_LIFETIME=60
JWT_REFRESH_TOKEN_LIFETIME=1440
EOF
    echo -e "${YELLOW}Please edit .env file with your settings!${NC}"
    echo "Press Enter to continue after editing..."
    read
fi

# Setup Python environment
echo -e "${YELLOW}[1/6] Setting up Python virtual environment...${NC}"
sudo -u svr python3 -m venv venv
sudo -u svr venv/bin/pip install --upgrade pip
sudo -u svr venv/bin/pip install -r requirements.txt

# Generate secret key if needed
echo -e "${YELLOW}[2/6] Generating secret key...${NC}"
SECRET_KEY=$(sudo -u svr venv/bin/python -c 'from django.core.management.utils import get_random_secret_key; print(get_random_secret_key())')
sed -i "s/SECRET_KEY=CHANGE_THIS_TO_RANDOM_SECRET_KEY/SECRET_KEY=$SECRET_KEY/" .env

# Run migrations
echo -e "${YELLOW}[3/6] Running database migrations...${NC}"
sudo -u svr venv/bin/python manage.py migrate

# Initialize permissions
echo -e "${YELLOW}[4/6] Initializing permissions...${NC}"
sudo -u svr venv/bin/python manage.py init_permissions || echo "Permissions may already be initialized"

# Initialize settings
echo -e "${YELLOW}[5/6] Initializing settings...${NC}"
sudo -u svr venv/bin/python manage.py init_settings || echo "Settings may already be initialized"

# Collect static files
echo -e "${YELLOW}[6/6] Collecting static files...${NC}"
sudo -u svr venv/bin/python manage.py collectstatic --noinput

# Setup frontend
if [ -d "frontend" ]; then
    echo -e "${YELLOW}Setting up frontend...${NC}"
    cd frontend
    sudo -u svr npm install
    cd ..
fi

# Set permissions
chown -R svr:svr $APP_DIR
chmod -R 755 $APP_DIR
chmod -R 775 $APP_DIR/media
chmod -R 775 $APP_DIR/logs

echo ""
echo -e "${GREEN}Application setup complete!${NC}"
echo ""
echo "Next steps:"
echo "1. Create superuser: sudo -u svr $APP_DIR/venv/bin/python manage.py createsuperuser"
echo "2. Configure services: sudo bash deploy/setup-services.sh"
echo "3. Configure Nginx: sudo bash deploy/setup-nginx.sh"
echo ""

