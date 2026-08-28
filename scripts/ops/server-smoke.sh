#!/usr/bin/env bash
set -euo pipefail

# server 镜像运行态冒烟（与 CI docker-build job 同源）
# 用法：bash scripts/ops/server-smoke.sh
# 前置：server 镜像已构建（本地经 docker-smoke.sh --server，或 CI build-push 产物）；postgres/redis 宿主可达（本地先 ops:env-up）。
# 环境变量（均为冒烟专用丢弃值，可覆盖）：
#   IMAGE                缺省 multi-admin-server:ci
#   POSTGRES_PASSWORD    缺省 postgres（本地 compose 默认；如改过密码请以 DATABASE_URL 覆盖）
#   ADMIN_INIT_PASSWORD  缺省 smoke-admin-password
#   JWT_ACCESS_SECRET    缺省 smoke-access-secret-000000000000000000（38 字符，过 min(32)）
#   JWT_REFRESH_SECRET   缺省 smoke-refresh-secret-000000000000000000
#   SMOKE_PORT           缺省 3100（仅 MINGW 分支发布用；Linux --network host 恒 3000）

IMAGE="${IMAGE:-multi-admin-server:ci}"
SMOKE_PORT="${SMOKE_PORT:-3100}"
POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-postgres}"
ADMIN_INIT_PASSWORD="${ADMIN_INIT_PASSWORD:-smoke-admin-password}"
JWT_ACCESS_SECRET="${JWT_ACCESS_SECRET:-smoke-access-secret-000000000000000000}"
JWT_REFRESH_SECRET="${JWT_REFRESH_SECRET:-smoke-refresh-secret-000000000000000000}"

# 宿主可达性探测：Git Bash（MINGW）走 Docker Desktop host.docker.internal + 端口发布；
# Linux（含 CI runner）走 host 网络，容器内 localhost 即宿主 services 端口映射。
if uname -s | grep -q MINGW; then
  HOST="host.docker.internal"
  RUN_PORT_ARGS=(-p "${SMOKE_PORT}:3000")
  TARGET_URL="http://localhost:${SMOKE_PORT}/health"
else
  HOST="localhost"
  RUN_PORT_ARGS=("--network" "host")
  TARGET_URL="http://localhost:3000/health"
fi

DATABASE_URL="${DATABASE_URL:-postgresql://postgres:${POSTGRES_PASSWORD}@${HOST}:5432/multi_admin?schema=public}"
REDIS_URL="${REDIS_URL:-redis://${HOST}:6379}"
export DATABASE_URL REDIS_URL ADMIN_INIT_PASSWORD JWT_ACCESS_SECRET JWT_REFRESH_SECRET

echo "▶ 清理旧容器（如有）..."
docker rm -f server-smoke 2>/dev/null || true

echo "▶ 启动 server 冒烟容器（IMAGE=${IMAGE}）..."
docker run -d --name server-smoke \
  "${RUN_PORT_ARGS[@]}" \
  -e DATABASE_URL \
  -e REDIS_URL \
  -e ADMIN_INIT_PASSWORD \
  -e JWT_ACCESS_SECRET \
  -e JWT_REFRESH_SECRET \
  "${IMAGE}"

echo "▶ curl /health 重试循环（10 次 × 3s，容忍 migrate+seed+启动冷延迟）..."
ok=0
for i in 1 2 3 4 5 6 7 8 9 10; do
  body=$(curl -s -m 5 "${TARGET_URL}" || true)
  if echo "${body}" | grep -q '"code":0'; then
    ok=1
    break
  fi
  echo "  尝试 ${i}/10：未达 code:0，等待 3s..."
  sleep 3
done

echo "▶ entrypoint 三段标记断言..."
# 注意：不能写成 `docker logs ... | grep -qF`——grep -q 命中即退出会使 docker logs 收到
# SIGPIPE 非零退出，在 pipefail 下管道整体非零、if 恒假（已实测踩坑）。先捕获再断言。
SMOKE_LOGS="$(docker logs server-smoke 2>&1 || true)"
if echo "${SMOKE_LOGS}" | grep -qF "[entrypoint] migrate deploy"; then
  echo "  ✔ [entrypoint] migrate deploy"
else
  echo "  ✖ 缺失 [entrypoint] migrate deploy"
  ok=0
fi
if echo "${SMOKE_LOGS}" | grep -qF "[entrypoint] db seed"; then
  echo "  ✔ [entrypoint] db seed"
else
  echo "  ✖ 缺失 [entrypoint] db seed"
  ok=0
fi
if echo "${SMOKE_LOGS}" | grep -qF "[entrypoint] start server"; then
  echo "  ✔ [entrypoint] start server"
else
  echo "  ✖ 缺失 [entrypoint] start server"
  ok=0
fi

echo "▶ 容器日志（完整）："
echo "${SMOKE_LOGS}"

echo "▶ 清理容器..."
docker rm -f server-smoke

if [ "${ok}" = "1" ]; then
  echo "✔ server 冒烟通过（/health code:0 + entrypoint 三段）"
else
  echo "✖ server 冒烟失败"
  exit 1
fi