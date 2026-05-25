# Disaster recovery — restore procedure

Use this runbook on the **production server** after data loss, corruption, or migration failure. Practice on a **staging VM** quarterly.

## Before you start

- Stop writes: put the app in maintenance mode or stop user traffic.
- Identify the backup set under `backups/<timestamp>/` or download from S3.
- Never run restore against production without a snapshot of current state if anything might be recoverable.

```bash
cd /opt/smart_vehicle_repairs_system
export COMPOSE="docker compose -f docker-compose.yml -f docker-compose.prod.yml"
export RESTORE_FROM="${RESTORE_FROM:-backups/latest}"   # or backups/20260525_020001
```

## 1. Stop application services

```bash
$COMPOSE stop backend celery celerybeat frontend nginx
```

Leave `db` and `redis` running unless you plan a full DB replace.

## 2. Restore PostgreSQL

```bash
set -a && source .env && set +a

# Drop and recreate database (destructive)
$COMPOSE exec -T db psql -U "$DB_USER" -d postgres -c \
  "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '${DB_NAME}' AND pid <> pg_backend_pid();"
$COMPOSE exec -T db dropdb -U "$DB_USER" --if-exists "$DB_NAME"
$COMPOSE exec -T db createdb -U "$DB_USER" "$DB_NAME"

# Restore custom-format dump
cat "${RESTORE_FROM}/database.dump" | $COMPOSE exec -T db pg_restore -U "$DB_USER" -d "$DB_NAME" --no-owner --no-acl
```

If `pg_restore` warns about existing objects on a fresh DB, that is usually safe to ignore.

## 3. Restore media files

```bash
rm -rf media
mkdir -p media
tar -xzf "${RESTORE_FROM}/media.tar.gz" -C .
chown -R 1000:1000 media logs 2>/dev/null || true
```

## 4. Start stack and verify

```bash
$COMPOSE up -d
sleep 15
curl -sf http://localhost/api/health/ready/ | jq .
```

Checklist:

- [ ] `/api/health/ready/` returns `"status": "ok"`
- [ ] Admin login works
- [ ] Sample work order / invoice opens
- [ ] Celery worker and beat are `Up`

## 5. Re-enable traffic

Disable maintenance mode in system settings and confirm NPM/HTTPS routing.

## Restore from S3

```bash
export RESTORE_FROM=/tmp/svr-restore
mkdir -p "$RESTORE_FROM"
aws s3 sync s3://your-bucket/svr-backups/<timestamp>/ "$RESTORE_FROM/"
# Then follow steps 1–5
```

## Partial restore (media only)

```bash
tar -xzf "${RESTORE_FROM}/media.tar.gz" -C .
$COMPOSE restart backend celery nginx
```

## When to restore vs rollback release

| Situation | Action |
|-----------|--------|
| Bad application code deploy | `git checkout <tag>` + `bash deploy/release.sh` |
| Bad migration / data corruption | Full restore from backup |
| Accidental file deletion in media | Media tarball restore only |

## RTO / RPO targets (adjust for your SLA)

| Metric | Suggested target |
|--------|------------------|
| **RPO** (max data loss) | 24 hours (daily backups) |
| **RTO** (time to restore) | 2–4 hours (first drill may take longer) |

Record each drill date and duration in your ops log.
