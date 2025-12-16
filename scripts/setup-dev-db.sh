#!/bin/bash

###############################################################################
# Development Database Setup Script
# Creates the development database if using system PostgreSQL
# Usage: sudo bash scripts/setup-dev-db.sh
###############################################################################

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

DB_NAME="aap_dev"
DB_USER="aap"

if [ "$EUID" -ne 0 ]; then
    echo -e "${RED}Please run as root (use sudo)${NC}"
    exit 1
fi

echo -e "${BLUE}Setting up development database...${NC}"
echo ""

# Check if PostgreSQL is running
if ! systemctl is-active --quiet postgresql; then
    echo -e "${RED}PostgreSQL is not running. Please start it first.${NC}"
    exit 1
fi

# Create database if it doesn't exist
echo -e "${YELLOW}Creating database: $DB_NAME${NC}"
sudo -u postgres psql -c "SELECT 1 FROM pg_database WHERE datname='$DB_NAME'" | grep -q 1 || \
    sudo -u postgres psql -c "CREATE DATABASE $DB_NAME;" && \
    echo -e "${GREEN}✓ Database created${NC}" || \
    echo -e "${YELLOW}Database may already exist${NC}"

# Grant permissions (user should already exist from production setup)
echo -e "${YELLOW}Granting permissions to $DB_USER...${NC}"
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE $DB_NAME TO $DB_USER;" 2>/dev/null && \
    echo -e "${GREEN}✓ Permissions granted${NC}" || \
    echo -e "${YELLOW}Note: If user $DB_USER doesn't exist, you may need to use the production database user${NC}"

echo ""
echo -e "${GREEN}✓ Development database setup complete!${NC}"

