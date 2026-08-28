#!/usr/bin/env bash
set -euo pipefail

# 本地 Docker 镜像冒烟验证（与 CI docker-build job 同源）
# 用法：bash scripts/ops/docker-smoke.sh [--server]
# --server：追加 nestjs-server 构建 + 运行态冒烟（server-smoke.sh；须先 ops:env-up 提供 postgres/redis）

echo "▶ 构建 pure-web 镜像（仓库根 context）..."
docker build \
  -f apps/pure-web/Dockerfile . \
  -t multi-admin-web:ci \
  --build-arg PNPM_REGISTRY=https://registry.npmjs.org \
  --build-arg COREPACK_NPM_REGISTRY=https://registry.npmjs.org

echo "▶ 启动 web 冒烟容器..."
docker rm -f web-smoke 2>/dev/null || true
docker run -d --name web-smoke -p 8848:80 multi-admin-web:ci

echo "▶ curl 重试循环（5 次，间隔 2s）..."
code="000"
for i in 1 2 3 4 5; do
  code=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:8848) || true
  if [ "$code" = "200" ]; then
    break
  fi
  echo "  尝试 ${i}/5：HTTP ${code}，等待 2s..."
  sleep 2
done

echo ""
echo "▶ 容器日志："
docker logs web-smoke

echo ""
echo "▶ 清理容器..."
docker rm -f web-smoke

if [ "$code" = "200" ]; then
  echo "✔ pure-web 冒烟通过（HTTP 200）"
else
  echo "✖ pure-web 冒烟失败（HTTP ${code}）"
  exit 1
fi

# --server：额外构建 nestjs-server 镜像
if [ "${1:-}" = "--server" ]; then
  echo ""
  echo "▶ 构建 nestjs-server 镜像..."
  docker build \
    -f apps/nestjs-server/Dockerfile . \
    -t multi-admin-server:ci \
    --build-arg PNPM_REGISTRY=https://registry.npmjs.org \
    --build-arg COREPACK_NPM_REGISTRY=https://registry.npmjs.org \
    --build-arg PRISMA_ENGINES_MIRROR=https://binaries.prisma.sh
  echo "✔ nestjs-server 镜像构建成功"

  echo ""
  echo "▶ server 运行态冒烟..."
  bash "$(dirname "$0")/server-smoke.sh"
fi
