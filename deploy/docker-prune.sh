#!/usr/bin/env bash
# Reclaim build/release leftovers without removing named volumes or backups.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

echo "==> Disk before cleanup"
df -h /
docker system df || true

echo "==> Pruning Docker build cache and unused runtime objects"
docker builder prune -af
docker system prune -f

echo "==> Removing images unused by every container"
# -a removes images not referenced by any running or stopped container.
# Named volumes and container data are unaffected.
docker image prune -af

echo "==> Clearing safe SVR build leftovers"
find "$ROOT" -xdev -ignore_readdir_race \
  \( -name '__pycache__' -o -name '.pytest_cache' -o -name '.mypy_cache' \
     -o -name '.ruff_cache' -o -name '*.egg-info' -o -name 'htmlcov' \) \
  -type d -prune -exec rm -rf {} + 2>/dev/null || true
find "$ROOT" -xdev -ignore_readdir_race \
  \( -name '*.pyc' -o -name '*.pyo' -o -name '.coverage' -o -name 'coverage.xml' \) \
  -type f -delete 2>/dev/null || true

for path in \
  "$ROOT/frontend/.next" \
  "$ROOT/frontend/node_modules" \
  "$ROOT/frontend/out" \
  "$ROOT/node_modules" \
  "$ROOT/.venv" \
  "$ROOT/venv" \
  "$ROOT/staticfiles" \
  "$ROOT/.turbo"
do
  [ ! -e "$path" ] || rm -rf "$path"
done

echo "==> Trimming oversized local logs"
mkdir -p "$ROOT/logs"
for log in "$ROOT"/logs/*.log; do
  [ -f "$log" ] || continue
  if [ "$(wc -c <"$log")" -gt 2097152 ]; then
    tail -c 2097152 "$log" >"${log}.tmp" && mv "${log}.tmp" "$log"
  fi
done

rm -rf "${HOME}/.cache/yarn" "${HOME}/.npm/_cacache" "${HOME}/.npm/_logs" 2>/dev/null || true

echo "==> Disk after cleanup"
df -h /
docker system df || true
echo "Named volumes, media, backups, and .env were not touched."
