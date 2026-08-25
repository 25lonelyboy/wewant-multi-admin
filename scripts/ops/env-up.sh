#!/usr/bin/env bash
set -euo pipefail

# 开发环境一键启动：postgres + redis → 健康等待 → prisma migrate → seed
# 用法：bash scripts/ops/env-up.sh

echo "▶ 启动 postgres + redis..."
docker compose up -d postgres redis

echo "▶ 等待健康检查（最多 30s）..."
elapsed=0
until docker compose exec -T postgres pg_isready -U postgres >/dev/null 2>&1; do
  sleep 2
  elapsed=$((elapsed + 2))
  if [ "$elapsed" -ge 30 ]; then
    echo "✖ postgres 30s 内未就绪"
    exit 1
  fi
done
echo "  ✔ postgres 就绪"

elapsed=0
until docker compose exec -T redis redis-cli ping >/dev/null 2>&1; do
  sleep 2
  elapsed=$((elapsed + 2))
  if [ "$elapsed" -ge 30 ]; then
    echo "✖ redis 30s 内未就绪"
    exit 1
  fi
done
echo "  ✔ redis 就绪"

echo "▶ 执行 prisma migrate deploy..."
pnpm --filter @multi-admin/nestjs-server exec prisma migrate deploy

echo "▶ 执行 prisma db seed..."
pnpm --filter @multi-admin/nestjs-server exec prisma db seed

echo ""
echo "✔ 开发环境就绪"
echo "  postgres: localhost:5432 (multi_admin)"
echo "  redis:    localhost:6379"
