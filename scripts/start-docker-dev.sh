#!/bin/bash
# Start Postgres + Redis for local dev (no docker-compose plugin required)
set -e

resolve_docker() {
  if command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1; then
    echo "docker"
    return
  fi
  # Docker Desktop on Windows from WSL (integration may not be enabled yet)
  local win_docker="/mnt/c/Program Files/Docker/Docker/resources/bin/docker.exe"
  if [ -x "$win_docker" ] && "$win_docker" info >/dev/null 2>&1; then
    echo "$win_docker"
    return
  fi
  if command -v docker.exe >/dev/null 2>&1 && docker.exe info >/dev/null 2>&1; then
    echo "docker.exe"
    return
  fi
  if sudo docker info >/dev/null 2>&1; then
    echo "sudo docker"
    return
  fi
  echo "docker"
}

DOCKER="$(resolve_docker)"
if ! $DOCKER info >/dev/null 2>&1; then
  echo "Docker is not running or not accessible."
  echo "Start Docker Desktop, or enable WSL integration for Ubuntu."
  exit 1
fi

$DOCKER start smart_vehicle_postgres_dev 2>/dev/null || \
  $DOCKER run -d --name smart_vehicle_postgres_dev \
    -e POSTGRES_DB=smart_vehicle_repairs_dev \
    -e POSTGRES_USER=postgres \
    -e POSTGRES_PASSWORD=postgres \
    -p 5433:5432 \
    postgres:15

$DOCKER start smart_vehicle_redis 2>/dev/null || \
  $DOCKER run -d --name smart_vehicle_redis \
    -p 6379:6379 \
    redis:7-alpine

echo "Waiting for Postgres..."
for i in $(seq 1 30); do
  $DOCKER exec smart_vehicle_postgres_dev pg_isready -U postgres >/dev/null 2>&1 && break
  sleep 1
done

echo "Postgres: localhost:5433 | Redis: localhost:6379"
