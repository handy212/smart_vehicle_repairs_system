#!/bin/bash

###############################################################################
# LAN Development Server Startup Script
# Detects the current LAN IP and starts Django + Next.js bound to 0.0.0.0.
# Usage: bash scripts/lan-server.sh
###############################################################################

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}  LAN Development Server Setup${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

echo -e "${YELLOW}Detecting LAN IP address...${NC}"
LAN_IP="$(hostname -I | awk '{print $1}')"

if [ -z "$LAN_IP" ]; then
    echo -e "${RED}Error: Could not detect a LAN IP address.${NC}"
    echo -e "${YELLOW}Set PUBLIC_HOST manually and rerun the script if needed.${NC}"
    exit 1
fi

echo -e "${GREEN}✓ Detected LAN IP: $LAN_IP${NC}"
echo ""
echo -e "${BLUE}Access the app from other devices at:${NC}"
echo -e "  Frontend: ${GREEN}http://$LAN_IP:3001${NC}"
echo -e "  Backend:  ${GREEN}http://$LAN_IP:8001${NC}"
echo ""

export DJANGO_BIND_ADDRESS="0.0.0.0"
export NEXTJS_BIND_ADDRESS="0.0.0.0"
export DJANGO_HOST="$LAN_IP"
export PUBLIC_HOST="$LAN_IP"

bash "$SCRIPT_DIR/dev-server.sh"
