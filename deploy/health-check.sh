#!/bin/bash

###############################################################################
# Health Check Script for Smart Vehicle Repairs
# Run with: sudo bash deploy/health-check.sh
# This script checks if all services are running and fixes common issues
###############################################################################

set -e

APP_DIR="/var/www/svr"
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${GREEN}Running health check...${NC}"
echo ""

# Check if services are enabled
echo -e "${YELLOW}Checking service status...${NC}"
SERVICES=("svr" "svr-celery" "svr-celerybeat" "svr-nextjs" "nginx" "postgresql" "redis-server")
FAILED_SERVICES=()

for service in "${SERVICES[@]}"; do
    if systemctl is-enabled "$service" >/dev/null 2>&1; then
        if systemctl is-active --quiet "$service"; then
            echo -e "  ${GREEN}✓${NC} $service is running"
        else
            echo -e "  ${RED}✗${NC} $service is enabled but not running"
            FAILED_SERVICES+=("$service")
        fi
    else
        echo -e "  ${YELLOW}⚠${NC} $service is not enabled"
    fi
done

# Start failed services
if [ ${#FAILED_SERVICES[@]} -gt 0 ]; then
    echo ""
    echo -e "${YELLOW}Starting failed services...${NC}"
    for service in "${FAILED_SERVICES[@]}"; do
        echo "  Starting $service..."
        systemctl start "$service" || echo -e "  ${RED}Failed to start $service${NC}"
    done
fi

# Check database connection
echo ""
echo -e "${YELLOW}Checking database connection...${NC}"
if [ -f "$APP_DIR/.env" ]; then
    DB_URL=$(grep "^DATABASE_URL=" "$APP_DIR/.env" | cut -d'=' -f2- | tr -d '"' | tr -d "'")
    if [ -n "$DB_URL" ]; then
        # Extract database name from URL
        DB_NAME=$(echo "$DB_URL" | sed -n 's/.*\/\([^?]*\).*/\1/p')
        if sudo -u postgres psql -lqt | cut -d \| -f 1 | grep -qw "$DB_NAME"; then
            echo -e "  ${GREEN}✓${NC} Database '$DB_NAME' exists"
        else
            echo -e "  ${RED}✗${NC} Database '$DB_NAME' does not exist"
            echo -e "  ${YELLOW}Run: sudo bash deploy/setup-database.sh${NC}"
        fi
    fi
else
    echo -e "  ${RED}✗${NC} .env file not found at $APP_DIR/.env"
fi

# Check if gunicorn can bind
echo ""
echo -e "${YELLOW}Checking application health...${NC}"
if curl -s -f http://localhost:8000/api/health/ >/dev/null 2>&1 || curl -s -f http://localhost/api/health/ >/dev/null 2>&1; then
    echo -e "  ${GREEN}✓${NC} API is responding"
else
    echo -e "  ${YELLOW}⚠${NC} API health endpoint not responding (this may be normal if endpoint doesn't exist)"
fi

# Check file permissions
echo ""
echo -e "${YELLOW}Checking file permissions...${NC}"
if [ -d "$APP_DIR" ]; then
    OWNER=$(stat -c '%U' "$APP_DIR")
    if [ "$OWNER" = "svr" ]; then
        echo -e "  ${GREEN}✓${NC} Application directory owned by svr"
    else
        echo -e "  ${YELLOW}⚠${NC} Application directory owned by $OWNER (should be svr)"
        echo -e "  ${YELLOW}Run: chown -R svr:svr $APP_DIR${NC}"
    fi
else
    echo -e "  ${RED}✗${NC} Application directory not found: $APP_DIR"
fi

# Check socket file (if using unix socket)
if [ -S "$APP_DIR/svr.sock" ]; then
    SOCK_OWNER=$(stat -c '%U' "$APP_DIR/svr.sock")
    if [ "$SOCK_OWNER" = "svr" ]; then
        echo -e "  ${GREEN}✓${NC} Socket file permissions OK"
    else
        echo -e "  ${YELLOW}⚠${NC} Socket file owned by $SOCK_OWNER (should be svr)"
        echo -e "  ${YELLOW}Run: chown svr:svr $APP_DIR/svr.sock${NC}"
    fi
fi

echo ""
echo -e "${GREEN}Health check complete!${NC}"
echo ""
echo "To view service logs:"
echo "  sudo journalctl -u svr -f"
echo "  sudo journalctl -u svr-nextjs -f"
echo ""




