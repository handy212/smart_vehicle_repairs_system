#!/bin/bash

###############################################################################
# Docker Backup Script
# Run with: bash deploy/docker-backup.sh
###############################################################################

BACKUP_DIR="./backups"
DATE=$(date +%Y%m%d_%H%M%S)

mkdir -p $BACKUP_DIR

echo "Creating backups..."

# Database backup
echo "Backing up database..."
docker-compose exec -T db pg_dump -U svr_user svr_db | gzip > $BACKUP_DIR/db_$DATE.sql.gz

# Media files backup
echo "Backing up media files..."
tar -czf $BACKUP_DIR/media_$DATE.tar.gz media/

# Logs backup (optional)
echo "Backing up logs..."
tar -czf $BACKUP_DIR/logs_$DATE.tar.gz logs/

# Keep only last 7 days
echo "Cleaning old backups..."
find $BACKUP_DIR -name "*.gz" -mtime +7 -delete

echo "Backup complete!"
echo "Files saved in: $BACKUP_DIR"
ls -lh $BACKUP_DIR/*$DATE*

