#!/bin/bash

###############################################################################
# Systemd Services Setup Script
# Run with: sudo bash deploy/setup-services.sh
###############################################################################

set -e

APP_DIR="/var/www/svr"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${GREEN}Setting up systemd services...${NC}"
echo ""

# Gunicorn service
echo -e "${YELLOW}Creating Gunicorn service...${NC}"
cat > /etc/systemd/system/svr.service << EOF
[Unit]
Description=Smart Vehicle Repairs Gunicorn daemon
After=network.target postgresql.service redis-server.service
Requires=postgresql.service redis-server.service

[Service]
Type=notify
User=svr
Group=svr
WorkingDirectory=$APP_DIR
Environment="PATH=$APP_DIR/venv/bin"
EnvironmentFile=$APP_DIR/.env
ExecStartPre=/bin/bash -c 'timeout=30; elapsed=0; while ! /usr/bin/pg_isready -h localhost -p 5432 >/dev/null 2>&1 && [ $elapsed -lt $timeout ]; do /bin/sleep 1; elapsed=$((elapsed+1)); done; [ $elapsed -lt $timeout ]'
ExecStartPre=/bin/bash -c 'timeout=30; elapsed=0; while ! /usr/bin/redis-cli ping >/dev/null 2>&1 && [ $elapsed -lt $timeout ]; do /bin/sleep 1; elapsed=$((elapsed+1)); done; [ $elapsed -lt $timeout ]'
ExecStart=$APP_DIR/venv/bin/gunicorn \
    --access-logfile - \
    --workers 3 \
    --bind 0.0.0.0:8000 \
    --timeout 120 \
    --max-requests 1000 \
    --max-requests-jitter 50 \
    config.wsgi:application
Restart=always
RestartSec=10
TimeoutStopSec=30
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF

# Celery worker service
echo -e "${YELLOW}Creating Celery worker service...${NC}"
cat > /etc/systemd/system/svr-celery.service << EOF
[Unit]
Description=Smart Vehicle Repairs Celery Worker
After=network.target redis-server.service postgresql.service
Requires=redis-server.service postgresql.service

[Service]
Type=simple
User=svr
Group=svr
WorkingDirectory=$APP_DIR
Environment="PATH=$APP_DIR/venv/bin"
EnvironmentFile=$APP_DIR/.env
ExecStart=$APP_DIR/venv/bin/celery -A config worker \
    --loglevel=info \
    --logfile=$APP_DIR/logs/celery.log
Restart=always
RestartSec=10
TimeoutStartSec=60
TimeoutStopSec=30
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF

# Celery beat service
echo -e "${YELLOW}Creating Celery beat service...${NC}"
cat > /etc/systemd/system/svr-celerybeat.service << EOF
[Unit]
Description=Smart Vehicle Repairs Celery Beat
After=network.target redis-server.service postgresql.service
Requires=redis-server.service postgresql.service

[Service]
Type=simple
User=svr
Group=svr
WorkingDirectory=$APP_DIR
Environment="PATH=$APP_DIR/venv/bin"
EnvironmentFile=$APP_DIR/.env
ExecStart=$APP_DIR/venv/bin/celery -A config beat \
    --loglevel=info \
    --logfile=$APP_DIR/logs/celerybeat.log \
    --scheduler django_celery_beat.schedulers:DatabaseScheduler
Restart=always
RestartSec=10
TimeoutStartSec=60
TimeoutStopSec=30
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF

# Next.js service (if frontend exists)
if [ -d "$APP_DIR/frontend" ]; then
    echo -e "${YELLOW}Creating Next.js service...${NC}"
    
    read -p "Frontend domain [yourdomain.com]: " FRONTEND_DOMAIN
    FRONTEND_DOMAIN=${FRONTEND_DOMAIN:-yourdomain.com}
    
    read -p "API URL [https://api.$FRONTEND_DOMAIN/api]: " API_URL
    API_URL=${API_URL:-https://api.$FRONTEND_DOMAIN/api}
    
    cat > /etc/systemd/system/svr-nextjs.service << EOF
[Unit]
Description=Smart Vehicle Repairs Next.js
After=network.target

[Service]
Type=simple
User=svr
Group=svr
WorkingDirectory=$APP_DIR/frontend
Environment="NODE_ENV=production"
Environment="NEXT_PUBLIC_API_URL=$API_URL"
ExecStart=/usr/bin/npm start
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF
fi

# Reload systemd and enable services
echo -e "${YELLOW}Enabling services...${NC}"
systemctl daemon-reload
systemctl enable svr
systemctl enable svr-celery
systemctl enable svr-celerybeat

if [ -f "/etc/systemd/system/svr-nextjs.service" ]; then
    systemctl enable svr-nextjs
fi

# Ensure database and redis are enabled
systemctl enable postgresql
systemctl enable redis-server
systemctl enable nginx

echo -e "${GREEN}Services configured!${NC}"
echo ""
echo "Start services with:"
echo "  sudo systemctl start svr"
echo "  sudo systemctl start svr-celery"
echo "  sudo systemctl start svr-celerybeat"
if [ -f "/etc/systemd/system/svr-nextjs.service" ]; then
    echo "  sudo systemctl start svr-nextjs"
fi
echo ""

