#!/bin/bash

###############################################################################
# Database Encoding Fix Script
# Converts PostgreSQL database from SQL_ASCII to UTF-8 encoding
# Run with: sudo bash deploy/fix-database-encoding.sh
###############################################################################

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${YELLOW}WARNING: This script will recreate the database with UTF-8 encoding.${NC}"
echo -e "${YELLOW}This will cause downtime and requires a database backup.${NC}"
echo ""
read -p "Are you sure you want to continue? (yes/no): " CONFIRM
if [[ "$CONFIRM" != "yes" ]]; then
    echo "Operation cancelled."
    exit 0
fi

# Database details (update these if different)
DB_NAME="aap"
DB_USER="aap"  # Update with actual user
BACKUP_FILE="/tmp/${DB_NAME}_backup_$(date +%Y%m%d_%H%M%S).sql"

echo -e "${YELLOW}Creating database backup...${NC}"
sudo -u postgres pg_dump -Fc $DB_NAME > $BACKUP_FILE

if [[ ! -s $BACKUP_FILE ]]; then
    echo -e "${RED}Backup failed or is empty. Aborting.${NC}"
    exit 1
fi

echo -e "${GREEN}Backup created: $BACKUP_FILE${NC}"

echo -e "${YELLOW}Dropping and recreating database with UTF-8 encoding...${NC}"

# Get the current owner
OWNER=$(sudo -u postgres psql -tAc "SELECT pg_get_userbyid(datdba) FROM pg_database WHERE datname = '$DB_NAME';")

sudo -u postgres psql << EOF
-- Terminate active connections
SELECT pg_terminate_backend(pid)
FROM pg_stat_activity
WHERE datname = '$DB_NAME' AND pid <> pg_backend_pid();

-- Drop database
DROP DATABASE $DB_NAME;

-- Recreate with UTF-8
CREATE DATABASE $DB_NAME
    WITH OWNER = $OWNER
    ENCODING = 'UTF8'
    LC_COLLATE = 'C.UTF-8'
    LC_CTYPE = 'C.UTF-8'
    TEMPLATE = template0;

-- Grant permissions
GRANT ALL PRIVILEGES ON DATABASE $DB_NAME TO $OWNER;
EOF

echo -e "${YELLOW}Restoring database from backup...${NC}"
sudo -u postgres pg_restore -d $DB_NAME $BACKUP_FILE

echo -e "${GREEN}Database encoding fix completed!${NC}"
echo -e "${GREEN}Backup file: $BACKUP_FILE${NC}"
echo ""
echo -e "${YELLOW}Please test your application to ensure everything works.${NC}"