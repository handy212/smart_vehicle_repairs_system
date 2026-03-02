#!/bin/bash

###############################################################################
# LAN Development Server Startup Script
# Automatically detects LAN IP and configures frontend to connect to it.
# Starts Django backend on 0.0.0.0 and Next.js frontend.
###############################################################################

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
FRONTEND_DIR="$PROJECT_DIR/frontend"

# Ports
DJANGO_PORT=8001
NEXTJS_PORT=3001

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}  LAN Development Server Setup${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# 1. Detect LAN IP
echo -e "${YELLOW}Detecting LAN IP address...${NC}"
# Try to get the IP address of the primary interface
LAN_IP=$(hostname -I | awk '{print $1}')

if [ -z "$LAN_IP" ]; then
    echo -e "${RED}Error: Could not detect LAN IP address.${NC}"
    exit 1
fi

echo -e "${GREEN}✓ Detected LAN IP: $LAN_IP${NC}"
echo ""

# 2. Update frontend .env.local
echo -e "${YELLOW}Configuring frontend for LAN access...${NC}"
FRONTEND_ENV_FILE="$FRONTEND_DIR/.env.local"

# Extract Google Client ID from existing .env if possible
GOOGLE_CLIENT_ID=$(grep "^GOOGLE_OAUTH_CLIENT_ID=" "$PROJECT_DIR/.env" 2>/dev/null | cut -d '=' -f2- | tr -d '\r')
if [ -z "$GOOGLE_CLIENT_ID" ]; then
    GOOGLE_CLIENT_ID=$(grep "^NEXT_PUBLIC_GOOGLE_CLIENT_ID=" "$FRONTEND_ENV_FILE" 2>/dev/null | cut -d '=' -f2- | tr -d '\r')
fi

cat > "$FRONTEND_ENV_FILE" << EOF
NEXT_PUBLIC_API_URL=http://$LAN_IP:$DJANGO_PORT/api
NEXT_PUBLIC_GOOGLE_CLIENT_ID=$GOOGLE_CLIENT_ID
EOF

echo -e "${GREEN}✓ Updated $FRONTEND_ENV_FILE${NC}"
echo -e "  NEXT_PUBLIC_API_URL=http://$LAN_IP:$DJANGO_PORT/api"
echo ""

# 3. Modify dev-server.sh to use 0.0.0.0 for Django if accessed via this script
# Or simply run the servers here. Let's reuse dev-server.sh but override variables if possible.
# Actually, it's better to just run the sequence here or modify dev-server.sh to be more flexible.

# For now, let's stop existing servers and start them properly.
echo -e "${YELLOW}Stopping existing development servers...${NC}"
bash "$SCRIPT_DIR/dev-stop.sh" || true
sleep 2

echo -e "${YELLOW}Starting servers with LAN access...${NC}"

# We'll use a modified version of the start command
# First, ensure dependencies and DB are ready by calling dev-server.sh with a flag to NOT start servers yet?
# dev-server.sh doesn't have such a flag.

# Let's just run dev-server.sh but we need it to bind Django to 0.0.0.0
# I'll create a temporary override or just patch dev-server.sh once to use 0.0.0.0 by default or via env var.

export DJANGO_BIND_ADDRESS="0.0.0.0"
export DJANGO_HOST="$LAN_IP"

# I'll patch dev-server.sh to support DJANGO_BIND_ADDRESS if not already patched
if ! grep -q "DJANGO_BIND_ADDRESS" "$SCRIPT_DIR/dev-server.sh"; then
    sed -i "s/python manage.py runserver \$DJANGO_PORT/python manage.py runserver \${DJANGO_BIND_ADDRESS:-127.0.0.1}:\$DJANGO_PORT/" "$SCRIPT_DIR/dev-server.sh"
fi

# Now run dev-server.sh
echo -e "${GREEN}Launching dev-server.sh with LAN IP configuration...${NC}"
echo -e "${BLUE}Access the system at: http://$LAN_IP:$NEXTJS_PORT${NC}"
echo ""

# Using nohup or just exec to keep it running
DJANGO_BIND_ADDRESS="0.0.0.0" DJANGO_HOST="$LAN_IP" bash "$SCRIPT_DIR/dev-server.sh"
