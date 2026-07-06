#!/bin/sh
set -eu

wait_for_database() {
    python <<'PY'
import os
import socket
import time
from urllib.parse import urlparse

database_url = os.environ.get("DATABASE_URL")
if not database_url:
    raise SystemExit(0)

parsed = urlparse(database_url)
host = parsed.hostname
port = parsed.port or 5432
if not host:
    raise SystemExit(0)

deadline = time.time() + int(os.environ.get("DATABASE_WAIT_TIMEOUT", "60"))
while True:
    try:
        with socket.create_connection((host, port), timeout=3):
            raise SystemExit(0)
    except OSError:
        if time.time() >= deadline:
            raise
        time.sleep(2)
PY
}

wait_for_database

if [ "${DJANGO_MIGRATE:-1}" = "1" ]; then
    python manage.py migrate --noinput
fi

if [ "${DJANGO_COLLECTSTATIC:-1}" = "1" ]; then
    python manage.py collectstatic --noinput
fi

exec "$@"
