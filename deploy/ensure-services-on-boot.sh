#!/bin/bash

###############################################################################
# Ensure Services Start on Boot
# Run with: sudo bash deploy/ensure-services-on-boot.sh
# This script ensures all required services are enabled to start on boot
###############################################################################

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${GREEN}Ensuring services start on boot...${NC}"
echo ""

# Required services
SERVICES=("svr" "svr-celery" "svr-celery-qbo" "svr-celerybeat" "nginx" "postgresql" "redis-server")

# Check if Next.js service exists
if [ -f "/etc/systemd/system/svr-nextjs.service" ]; then
    SERVICES+=("svr-nextjs")
fi

# Enable all services
for service in "${SERVICES[@]}"; do
    if systemctl list-unit-files | grep -q "^${service}.service"; then
        if systemctl is-enabled "$service" >/dev/null 2>&1; then
            echo -e "  ${GREEN}✓${NC} $service is already enabled"
        else
            echo -e "  ${YELLOW}Enabling $service...${NC}"
            systemctl enable "$service" || echo -e "  ${RED}Failed to enable $service${NC}"
        fi
    else
        echo -e "  ${YELLOW}⚠${NC} $service unit file not found"
    fi
done

# Reload systemd
systemctl daemon-reload

echo ""
echo -e "${GREEN}All services configured to start on boot!${NC}"
echo ""
echo "To verify, run:"
echo "  systemctl list-unit-files | grep svr"
echo "  systemctl is-enabled svr svr-celery svr-celery-qbo svr-celerybeat"
echo ""




