#!/usr/bin/env bash
set -euo pipefail

# 开发环境一键启动：postgres + redis + redis-queue + emqx + tdengine → 健康等待 → prisma migrate → seed
# 用法：bash scripts/ops/env-up.sh

echo "▶ 启动 postgres + redis + redis-queue + emqx + tdengine..."
docker compose up -d postgres redis redis-queue emqx tdengine

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

elapsed=0
until docker compose exec -T redis-queue redis-cli ping >/dev/null 2>&1; do
  sleep 2
  elapsed=$((elapsed + 2))
  if [ "$elapsed" -ge 30 ]; then
    echo "✖ redis-queue 30s 内未就绪"
    exit 1
  fi
done
echo "  ✔ redis-queue 就绪"

# EMQX 冷启动比 postgres/redis 慢（Erlang 节点 + 应用加载），单独放宽预算。
# 用 compose 的 health 状态判断，而非 exec 进容器执行命令：Git Bash 会把容器内绝对路径
# 转换成 Windows 路径，`exec ... /opt/emqx/bin/emqx` 会以 no such file or directory 失败。
elapsed=0
until [ "$(docker compose ps --format '{{.Health}}' emqx 2>/dev/null)" = "healthy" ]; do
  sleep 3
  elapsed=$((elapsed + 3))
  if [ "$elapsed" -ge 120 ]; then
    echo "✖ emqx 120s 内未就绪"
    exit 1
  fi
done
echo "  ✔ emqx 就绪"

# TDengine 首次启动要初始化数据目录，冷启动比 EMQX 还慢，预算再放宽。
# 走 taosAdapter 的 REST 接口探活：6041 已绑宿主回环，无需 exec 进容器（避开 Git Bash 的路径转换）。
elapsed=0
until curl -fsS -m 3 -X POST \
  -H "Authorization: Basic cm9vdDp0YW9zZGF0YQ==" \
  -d "SELECT SERVER_VERSION()" \
  "http://127.0.0.1:6041/rest/sql" >/dev/null 2>&1; do
  sleep 3
  elapsed=$((elapsed + 3))
  if [ "$elapsed" -ge 180 ]; then
    echo "✖ tdengine 180s 内未就绪"
    exit 1
  fi
done
echo "  ✔ tdengine 就绪"

echo "▶ 执行 prisma migrate deploy..."
pnpm --filter @multi-admin/nestjs-server exec prisma migrate deploy

echo "▶ 执行 prisma db seed..."
pnpm --filter @multi-admin/nestjs-server exec prisma db seed

echo "▶ 初始化 TDengine（建库 / 建超表 / 建子表 / 建流，幂等）..."
pnpm --filter @multi-admin/iot-worker run tdengine:init

echo ""
echo "✔ 开发环境就绪"
echo "  postgres:    localhost:5432 (multi_admin)"
echo "  redis:       localhost:6379（业务缓存）"
echo "  redis-queue: localhost:6380（队列）"
echo "  emqx:        localhost:1883 (MQTT) / localhost:18083 (Dashboard)"
echo "  tdengine:    localhost:6041 (taosAdapter REST/WebSocket)"
