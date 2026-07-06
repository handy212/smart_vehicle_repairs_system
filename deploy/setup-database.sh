#!/bin/bash

###############################################################################
# Database Setup Script
# Run with: sudo bash deploy/setup-database.sh
###############################################################################

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${GREEN}Setting up PostgreSQL database...${NC}"
echo ""

# Get database credentials
read -p "Database name [svr_db]: " DB_NAME
DB_NAME=${DB_NAME:-svr_db}

read -p "Database user [svr_user]: " DB_USER
DB_USER=${DB_USER:-svr_user}

read -sp "Database password: " DB_PASSWORD
echo ""

# Create database and user
echo -e "${YELLOW}Creating database and user...${NC}"
sudo -u postgres psql << EOF
-- Create database
CREATE DATABASE $DB_NAME;

-- Create user
CREATE USER $DB_USER WITH PASSWORD '$DB_PASSWORD';

-- Set permissions
ALTER ROLE $DB_USER SET client_encoding TO 'utf8';
ALTER ROLE $DB_USER SET default_transaction_isolation TO 'read committed';
ALTER ROLE $DB_USER SET timezone TO 'UTC';
GRANT ALL PRIVILEGES ON DATABASE $DB_NAME TO $DB_USER;
EOF

echo -e "${GREEN}Database created successfully!${NC}"
echo ""
echo "Database URL for .env file:"
echo "DATABASE_URL=postgresql://$DB_USER:$DB_PASSWORD@localhost:5432/$DB_NAME"
echo ""
echo "Save this information securely!"

