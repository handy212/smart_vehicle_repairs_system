#!/bin/bash
# Start Postgres + Redis for local dev (no docker-compose plugin required)
set -e

DOCKER="docker"
if ! docker info >/dev/null 2>&1; then
  DOCKER="sudo docker"
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
