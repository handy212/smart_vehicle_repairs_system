# Production deployment guide

Smart Vehicle Repairs System ships as a **Docker Compose** stack. This document is for the **production server** that receives the software — not the development machine.

## What ships in the repository

| Artifact | Purpose |
|----------|---------|
| `docker-compose.yml` | Base service definitions |
| `docker-compose.prod.yml` | Production hardening (no public DB/Redis, required secrets) |
| `docker-compose.local.yml` | Dev-only overlay (exposes DB/Redis ports) |
| `.env.production.example` | Environment variable template |
| `scripts/validate-env.sh` | Pre-flight env validation |
| `deploy/bootstrap.sh` | **First install only** |
| `deploy/release.sh` | **Every update** |
| `deploy/backup.sh` | **Daily backups** (cron) |
| `deploy/RESTORE.md` | Disaster recovery runbook |
| `deploy/install-backup-cron.sh` | Install backup cron job |
| `deploy/STAGING.md` | Pre-production staging environment |

## Prerequisites (production server)

- Ubuntu 22.04+ or Debian 12+
- Docker Engine + Docker Compose plugin
- Ports **80** (and **443** on NPM) open to the internet
- Domain names for frontend and API (e.g. `app.example.com`, `api.example.com`)

## First install

```bash
git clone <REPO_URL> smart_vehicle_repairs_system
cd smart_vehicle_repairs_system

cp .env.production.example .env
nano .env   # fill SECRET_KEY, passwords, domains, API_URL, CORS

# Edit deploy/nginx/default.conf.http-npm — set server_name to your domains

bash scripts/validate-env.sh .env
bash deploy/bootstrap.sh

docker compose -f docker-compose.yml -f docker-compose.prod.yml exec backend \
  python manage.py createsuperuser
```

Configure **Nginx Proxy Manager** (or equivalent) to forward:

| Public domain | Forward to | Notes |
|---------------|------------|-------|
| Frontend | `http://<server-ip>:80` | WebSockets enabled |
| API | `http://<server-ip>:80` | Same port; nginx routes by Host header |

Set `SECURE_SSL_REDIRECT=False` in `.env` when NPM terminates HTTPS.

Verify:

```bash
curl -sf https://api.example.com/api/health/live/
curl -sf https://api.example.com/api/health/ready/
```

## Routine updates (every release)

```bash
cd smart_vehicle_repairs_system
git fetch --tags
git checkout vX.Y.Z   # or git pull origin main

bash scripts/validate-env.sh .env
bash deploy/release.sh
```

`release.sh` runs migrations and restarts services. It does **not** re-seed data.

## Development vs production compose

| Environment | Command |
|-------------|---------|
| **Production** | `docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d` |
| **Local full-stack debug** | `docker compose -f docker-compose.yml -f docker-compose.local.yml up -d` |
| **Dev (API + Next.js only)** | `bash scripts/dev-server.sh` + optional `docker compose -f docker-compose.dev.yml up -d` |

## Health endpoints

| Path | Use |
|------|-----|
| `/api/health/live/` | Process liveness |
| `/api/health/ready/` | DB + Redis readiness (use for monitoring) |
| `/api/health/` | Alias for live (backward compatible) |

## Backups

### Daily automated backup

```bash
# One-time test
bash deploy/backup.sh

# Install cron (daily 02:00)
bash deploy/install-backup-cron.sh
```

Backups are stored in `backups/<timestamp>/` with:

- `database.dump` — PostgreSQL custom format (`pg_restore`)
- `media.tar.gz` — uploaded files
- `manifest.json` — metadata

Optional offsite upload (set in `.env` or when running):

```bash
BACKUP_S3_URI=s3://your-bucket/svr-backups bash deploy/backup.sh
```

Requires AWS CLI configured on the server. Retention defaults to **30 days** (`BACKUP_RETENTION_DAYS`).

### Restore

See **[deploy/RESTORE.md](RESTORE.md)**. Run a restore drill on staging at least once per quarter.

Admin UI backups (`SystemBackup`) are a **supplement** — ops backups in `backups/` are authoritative.

## CI/CD (GitHub Actions)

| Workflow | When | Purpose |
|----------|------|---------|
| `release-gate.yml` | Push/PR to `main` | Tests, Celery validation, Docker config, frontend build |
| `docker-build.yml` | Tag `v*` | Build and push images to GHCR |
| `deploy-production.yml` | Manual | Validate ref, optional SSH deploy |

### Release tagging

```bash
git tag v1.0.0
git push origin v1.0.0
```

On the production server:

```bash
git checkout v1.0.0
bash deploy/release.sh
```

### Optional automated SSH deploy

Add GitHub repository secrets:

- `DEPLOY_HOST` — production server IP/hostname
- `DEPLOY_USER` — SSH user
- `DEPLOY_SSH_KEY` — private key
- `DEPLOY_PATH` — optional, default `/opt/smart_vehicle_repairs_system`

Then run **Actions → Deploy production** with the tag or branch.

## Observability (optional)

Set on the production server `.env`:

```env
SENTRY_DSN=https://...@sentry.io/...
SENTRY_ENVIRONMENT=production
SENTRY_RELEASE=v1.0.0
```

Restart backend and Celery after changing Sentry variables.

External monitoring: point uptime checks at `/api/health/ready/`.

## Rollback

```bash
git checkout <previous-tag>
bash deploy/release.sh
```

If a migration is irreversible, restore from backup — document in your ops runbook.

## Legacy bare-metal path

Scripts under `deploy/` for systemd (`setup-services.sh`, `deploy.sh`, `update-production.sh`) remain for existing installs but are **not** the recommended shipping path for new deployments.

## Support checklist after install

- [ ] `validate-env.sh` passes
- [ ] `/api/health/ready/` returns 200
- [ ] Login works on frontend
- [ ] Celery worker and beat containers running
- [ ] Offsite backup cron configured
- [ ] Uptime monitor on `/api/health/ready/`
