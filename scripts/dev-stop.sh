#!/bin/bash

###############################################################################
# Development Server Stop Script
# Stops Django and Next.js development servers
# Usage: bash scripts/dev-stop.sh
###############################################################################

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}Stopping development servers...${NC}"

# Kill Django process on port 8001 (development port)
DJANGO_PID=$(lsof -ti:8001 2>/dev/null || true)
if [ ! -z "$DJANGO_PID" ]; then
    echo -e "${YELLOW}Stopping Django (PID: $DJANGO_PID)...${NC}"
    kill $DJANGO_PID 2>/dev/null || true
fi

# Kill Next.js process on port 3001 (development port)
NEXTJS_PID=$(lsof -ti:3001 2>/dev/null || true)
if [ ! -z "$NEXTJS_PID" ]; then
    echo -e "${YELLOW}Stopping Next.js (PID: $NEXTJS_PID)...${NC}"
    kill $NEXTJS_PID 2>/dev/null || true
fi

# Kill any remaining python manage.py runserver processes
pkill -f "manage.py runserver" 2>/dev/null || true

# Kill any remaining next dev processes
pkill -f "next dev" 2>/dev/null || true

sleep 1

echo -e "${GREEN}✓ Development servers stopped${NC}"

