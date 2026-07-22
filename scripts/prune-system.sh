#!/bin/bash
# Prune local/Windows/Docker junk safely. Keeps Postgres+Redis containers/volumes.
set -euo pipefail

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

resolve_docker() {
  local win_docker="/mnt/c/Program Files/Docker/Docker/resources/bin/docker.exe"
  if command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1; then
    echo docker; return
  fi
  if [ -x "$win_docker" ] && "$win_docker" info >/dev/null 2>&1; then
    echo "$win_docker"; return
  fi
  if command -v docker.exe >/dev/null 2>&1 && docker.exe info >/dev/null 2>&1; then
    echo docker.exe; return
  fi
  return 1
}

echo -e "${GREEN}=== System prune ===${NC}"
df -h / /mnt/c 2>/dev/null | grep -v loop || true

if DOCKER="$(resolve_docker)"; then
  echo -e "${YELLOW}Docker prune (keeps running DB containers/volumes)...${NC}"
  "$DOCKER" container prune -f >/dev/null
  "$DOCKER" image prune -af >/dev/null
  "$DOCKER" network prune -f >/dev/null
  "$DOCKER" builder prune -af >/dev/null
  for v in $("$DOCKER" volume ls -qf dangling=true 2>/dev/null || true); do
    [ -n "${v:-}" ] && "$DOCKER" volume rm "$v" >/dev/null 2>&1 || true
  done
  # Restore local development infrastructure only when production is not
  # already using the same host ports (5433 for Postgres, 6379 for Redis).
  if [ "$("$DOCKER" inspect -f '{{.State.Running}}' svr_db 2>/dev/null || true)" = "true" ] || \
     [ "$("$DOCKER" inspect -f '{{.State.Running}}' svr_redis 2>/dev/null || true)" = "true" ]; then
    echo -e "${YELLOW}Production infrastructure is running; skipped local dev startup.${NC}"
  else
    bash "$PROJECT_DIR/scripts/start-docker-dev.sh" >/dev/null
  fi
  "$DOCKER" system df
else
  echo -e "${YELLOW}Docker not available — skipped Docker prune${NC}"
fi

echo -e "${YELLOW}Project caches / build junk...${NC}"
cd "$PROJECT_DIR"

# Python / pytest / coverage (regenerated)
rm -rf .pytest_cache htmlcov .coverage .mypy_cache .ruff_cache 2>/dev/null || true
rm -f coverage.xml .coverage.* 2>/dev/null || true
find . \( -path ./venv-dev -o -path ./.git -o -path ./frontend/node_modules -o -path ./frontend/.next \) -prune \
  -o -type d -name '__pycache__' -print0 2>/dev/null \
  | xargs -0 rm -rf 2>/dev/null || true

# Django / Next logs (keep dirs)
mkdir -p logs
: > logs/django.log 2>/dev/null || true
: > logs/error.log 2>/dev/null || true
find frontend -path '*/.next/*/logs/*.log' -delete 2>/dev/null || true

# Playwright leftovers
rm -rf frontend/test-results frontend/playwright-report frontend/blob-report 2>/dev/null || true

# Next.js: reclaim GBs. Skip while next/npm build is running unless --force
NEXT_RUNNING=false
if pgrep -f '[n]ext (dev|build)|[n]pm run (dev|build)' >/dev/null 2>&1; then
  NEXT_RUNNING=true
fi
if [ "${1:-}" = "--force" ] || [ "${1:-}" = "--deep" ] || [ "$NEXT_RUNNING" = false ]; then
  if [ "${1:-}" = "--deep" ]; then
    echo -e "${YELLOW}Removing entire frontend/.next (deep)...${NC}"
    rm -rf frontend/.next
  else
    # Keep production build output if present; drop turbopack/dev cache (usually multi-GB)
    echo -e "${YELLOW}Removing frontend/.next/dev + cache...${NC}"
    rm -rf frontend/.next/dev frontend/.next/cache frontend/.next/trace 2>/dev/null || true
  fi
else
  DEV_SIZE="$(du -sh frontend/.next/dev 2>/dev/null | awk '{print $1}')"
  echo -e "${YELLOW}Skipped frontend/.next (Next.js is running; currently ~${DEV_SIZE:-?}).${NC}"
  echo -e "${YELLOW}Stop servers, then: bash scripts/prune-system.sh   # or --deep / --force${NC}"
fi

command -v npm >/dev/null 2>&1 && npm cache clean --force >/dev/null 2>&1 || true

echo -e "${YELLOW}Windows Temp / npm-cache (best effort)...${NC}"
powershell.exe -NoProfile -Command '
$ErrorActionPreference="SilentlyContinue"
$temp="C:\Users\Admin Computer\AppData\Local\Temp"
Get-ChildItem $temp -Force | ForEach-Object {
  Remove-Item -LiteralPath $_.FullName -Recurse -Force -ErrorAction SilentlyContinue
}
if (Test-Path "C:\Users\Admin Computer\AppData\Local\npm-cache") {
  Remove-Item "C:\Users\Admin Computer\AppData\Local\npm-cache\*" -Recurse -Force
}
Remove-Item "C:\Users\Admin Computer\AppData\Local\CrashDumps\*" -Recurse -Force
Clear-RecycleBin -Force
"done"
' 2>/dev/null | tr -d '\r' || true

journalctl --user --vacuum-size=20M >/dev/null 2>&1 || true

echo -e "${GREEN}=== After ===${NC}"
df -h / /mnt/c 2>/dev/null | grep -v loop || true
echo -e "${GREEN}Done.${NC}"
