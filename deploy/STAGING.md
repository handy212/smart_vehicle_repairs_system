# Staging environment

Use staging to validate releases **before** production. Staging uses an isolated Docker Compose project (`svr-staging`) so it can run on the same host as production without sharing databases or volumes.

## Quick start

```bash
git clone <REPO_URL> smart_vehicle_repairs_system
cd smart_vehicle_repairs_system
git checkout develop   # or a release candidate tag

cp .env.staging.example .env
nano .env
nano deploy/nginx/default.conf.http-npm   # staging domains

bash scripts/validate-env.sh .env

# First install
COMPOSE="docker compose -f docker-compose.yml -f docker-compose.staging.yml"
$COMPOSE up -d --build db redis
sleep 10
$COMPOSE up -d --build
$COMPOSE exec backend python manage.py migrate --noinput
$COMPOSE exec backend python manage.py collectstatic --noinput
bash deploy/bootstrap.sh   # or run bootstrap manage.py commands via $COMPOSE exec

$COMPOSE exec backend python manage.py createsuperuser
```

Default HTTP port: **8080** (`STAGING_HTTP_PORT`). Verify:

```bash
curl -sf http://localhost:8080/api/health/ready/
```

## Staging vs production

| | Staging | Production |
|---|---------|------------|
| Compose | `docker-compose.staging.yml` | `docker-compose.prod.yml` |
| Project name | `svr-staging` | default |
| Media/logs | `media-staging/`, `logs-staging/` | `media/`, `logs/` |
| Sentry env | `staging` | `production` |
| HTTP port | 8080 (default) | 80 |

## Release candidate workflow

1. Merge PR to `develop`
2. Deploy to staging: `git checkout <sha>` + `bash deploy/release-staging.sh`
3. Run smoke tests (login, work order, invoice, notification)
4. Run restore drill periodically using `deploy/RESTORE.md` on staging data
5. Tag `vX.Y.Z` and deploy to production

## Update staging

```bash
bash deploy/release-staging.sh
```

## Tear down

```bash
docker compose -f docker-compose.yml -f docker-compose.staging.yml down
# Add -v only if you intend to wipe staging data
```
