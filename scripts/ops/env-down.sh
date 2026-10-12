#!/usr/bin/env bash
set -euo pipefail

# 开发环境停止：停止 postgres + redis + redis-queue + emqx + tdengine（保留数据）
# --clean：清除数据卷
# 用法：bash scripts/ops/env-down.sh [--clean]

if [ "${1:-}" = "--clean" ]; then
  echo "▶ 停止全部 compose 服务并清除数据卷..."
  docker compose down -v
  echo "✔ 已停止并清除 postgres + redis + redis-queue + emqx + tdengine 数据卷"
else
  echo "▶ 停止 postgres + redis + redis-queue + emqx + tdengine（数据保留）..."
  docker compose stop postgres redis redis-queue emqx tdengine
  echo "✔ 已停止（数据保留）。如需清除数据：bash scripts/ops/env-down.sh --clean"
fi
