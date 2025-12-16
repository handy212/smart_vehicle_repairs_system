# Deployment Scripts

## Automated Deployment Script

The `deploy.sh` script syncs changes from the source directory (`/opt/smart_vehicle_repairs_system`) to the production directory (`/var/www/svr`) automatically.

### Quick Usage

```bash
# Sync files only (no rebuild/restart)
sudo bash deploy/deploy.sh

# Sync + rebuild frontend + restart Next.js
sudo bash deploy/deploy.sh --rebuild-frontend --restart

# Sync + rebuild backend + restart Django
sudo bash deploy/deploy.sh --rebuild-backend --restart

# Full deployment (sync + rebuild everything + restart all services)
sudo bash deploy/deploy.sh --all
```

### Options

- `--rebuild-frontend` - Rebuild Next.js frontend (runs `npm run build`)
- `--rebuild-backend` - Rebuild Django backend (runs migrations, collectstatic)
- `--restart` - Restart all services (Django, Next.js, Celery, Celery Beat)
- `--all` - Equivalent to `--rebuild-frontend --rebuild-backend --restart`

### What It Does

1. **Syncs files** using `rsync` from `/opt/smart_vehicle_repairs_system` to `/var/www/svr`
   - Excludes: `.git`, `node_modules`, `.next`, `.venv`, `logs`, `media`, `.env`, etc.
   - Preserves production `.env` file (backs it up and restores)
   - Sets correct file ownership (`svr:svr`)

2. **Rebuilds frontend** (if `--rebuild-frontend` is used)
   - Installs dependencies if needed
   - Builds Next.js application
   - Fixes `.next` directory permissions

3. **Rebuilds backend** (if `--rebuild-backend` is used)
   - Installs/updates Python dependencies
   - Runs database migrations
   - Collects static files

4. **Restarts services** (if `--restart` is used)
   - Restarts Django (svr.service)
   - Restarts Next.js (svr-nextjs.service)
   - Restarts Celery (svr-celery.service)
   - Restarts Celery Beat (svr-celerybeat.service)

### Typical Workflow

```bash
# After making changes to source code in /opt/smart_vehicle_repairs_system

# Option 1: Quick sync (files only, no restart)
sudo bash deploy/deploy.sh

# Option 2: Full deployment (recommended after code changes)
sudo bash deploy/deploy.sh --all
```

### Safety Features

- Backs up production `.env` file before syncing
- Preserves production-specific files (logs, media, .env)
- Validates source and target directories
- Checks service status after deployment
- Uses efficient `rsync` for file synchronization
