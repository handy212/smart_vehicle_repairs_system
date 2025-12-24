#!/bin/bash

###############################################################################
# Create Superuser Script
# Quick script to create an admin user for the Smart Vehicle Repairs System
###############################################################################

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
VENV_DIR="$PROJECT_DIR/venv-dev"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}  Create Superuser${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# Check if venv exists
if [ ! -d "$VENV_DIR" ]; then
    echo -e "${RED}Error: Virtual environment not found at $VENV_DIR${NC}"
    echo -e "${YELLOW}Run 'bash scripts/dev-server.sh' first to set up the environment${NC}"
    exit 1
fi

# Activate virtual environment
cd "$PROJECT_DIR"
source "$VENV_DIR/bin/activate"
export DJANGO_SETTINGS_MODULE=config.settings.development

echo -e "${GREEN}Creating superuser account...${NC}"
echo -e "${YELLOW}Please provide the following information:${NC}"
echo ""

# Create superuser interactively
python manage.py createsuperuser

echo ""
echo -e "${GREEN}✓ Superuser created successfully!${NC}"
echo ""
echo -e "${BLUE}You can now log in at:${NC}"
echo -e "  ${GREEN}http://localhost:8001/admin${NC}"
echo ""
