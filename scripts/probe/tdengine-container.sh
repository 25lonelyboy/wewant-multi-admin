#!/usr/bin/env bash
# 起一个临时的 TDengine 容器，跑 TDengine 语义探针，然后保持容器供人工复核。
#
# 用法：
#   bash scripts/probe/tdengine-container.sh              # 起容器 + 跑探针
#   bash scripts/probe/tdengine-container.sh --no-probe   # 只起容器
#   bash scripts/probe/tdengine-container.sh --down       # 停掉探针容器
#
# 安全口径：只把 6041 绑到宿主回环（与 EMQX 的既有约定一致），宿主之外连不进来。
# 容器名固定为 td-probe，与将来 docker-compose 里的服务不冲突。

set -uo pipefail

NAME="${TD_PROBE_NAME:-td-probe}"
PORT="${TDENGINE_PORT:-6041}"
IMAGE_CANDIDATES=(
  "tdengine/tsdb:3.4.1.6"
  "tdengine/tdengine:3.4.1.6"
  "tdengine/tsdb:latest"
  "tdengine/tdengine:latest"
)
PROBE_SCRIPT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/tdengine-semantics.mjs"

log() { printf '%s\n' "$*"; }
die() {
  log "✖ $*"
  exit 1
}

command -v docker >/dev/null 2>&1 || die "未找到 docker，请先启动 Docker Desktop"

if [ "${1:-}" = "--down" ]; then
  docker rm -f "$NAME" >/dev/null 2>&1 && log "已移除容器 $NAME" || log "容器 $NAME 不存在"
  exit 0
fi

# ── 已有同名容器则复用 ───────────────────────────────────────────────────
if [ "$(docker inspect -f '{{.State.Running}}' "$NAME" 2>/dev/null)" = "true" ]; then
  log "▶ 复用已在运行的容器 $NAME"
else
  docker rm -f "$NAME" >/dev/null 2>&1
  log "▶ 选择镜像（自 3.3.7.0 起社区版镜像名由 tdengine/tdengine 改为 tdengine/tsdb）"
  PICKED=""
  for img in "${IMAGE_CANDIDATES[@]}"; do
    if docker image inspect "$img" >/dev/null 2>&1; then
      PICKED="$img"
      log "  ✔ 本地已有：$img"
      break
    fi
    log "  … 拉取 $img"
    if docker pull "$img" >/dev/null 2>&1; then
      PICKED="$img"
      log "  ✔ 拉取成功：$img"
      break
    fi
    log "  ✖ 不可用：$img"
  done
  [ -n "$PICKED" ] || die "四个候选镜像都拿不到，请检查网络/镜像源或手动 docker pull"

  log "▶ 启动容器 $NAME（$PICKED，6041 → 127.0.0.1:$PORT）"
  docker run -d --name "$NAME" \
    -p "127.0.0.1:${PORT}:6041" \
    "$PICKED" >/dev/null || die "容器启动失败"
fi

# ── 等待 taosAdapter 就绪 ───────────────────────────────────────────────
log "▶ 等待 taosAdapter 就绪（http://127.0.0.1:${PORT}/rest/sql）…"
READY=0
for _ in $(seq 1 60); do
  if curl -fsS -m 3 -X POST \
    -H "Authorization: Basic cm9vdDp0YW9zZGF0YQ==" \
    -d "SELECT SERVER_VERSION()" \
    "http://127.0.0.1:${PORT}/rest/sql" >/dev/null 2>&1; then
    READY=1
    break
  fi
  sleep 2
done
[ "$READY" = "1" ] || {
  log "✖ 120 秒内未就绪，容器日志尾部："
  docker logs --tail 40 "$NAME"
  exit 1
}
log "  ✔ 就绪"

if [ "${1:-}" = "--no-probe" ]; then
  log "▶ 按要求跳过探针。停容器：bash scripts/probe/tdengine-container.sh --down"
  exit 0
fi

log ""
TDENGINE_URL="http://127.0.0.1:${PORT}" node "$PROBE_SCRIPT"
STATUS=$?

log ""
log "▶ 容器 $NAME 保留供人工复核（taos CLI：docker exec -it $NAME taos）"
log "  停掉并删除：bash scripts/probe/tdengine-container.sh --down"
exit $STATUS
