#!/usr/bin/env bash
# 镜像 digest pin 漂移巡检（季度）：对比仓库内 tag@digest 与远端最新 manifest-list digest。
# 用法：pnpm ops:check-digests；退出码 0 = 全部一致；1 = 漂移 / pin 缺失 / 远端获取失败。
# 退役条件：供应链加固落地 Renovate（:pinDigests）后由 bot 接管，届时删除本脚本。
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/../.."

FILES=(
  apps/nestjs-server/Dockerfile
  apps/pure-web/Dockerfile
  docker-compose.yml
  .github/workflows/ci.yml
)

PINS=$(grep -HnE '(^FROM[[:space:]]+|image:[[:space:]]*)[^#[:space:]]+@sha256:[0-9a-f]{64}' "${FILES[@]}" || true)
if [[ -z "$PINS" ]]; then
  echo "[check-digests] 未发现任何 digest pin（预期 10 处）" >&2
  exit 1
fi

declare -A PINNED_OF
STATUS=0
COUNT=0

while IFS= read -r PIN_LINE; do
  SRC="${PIN_LINE%%:*}"
  REST="${PIN_LINE#*:}"
  LINE_NO="${REST%%:*}"
  if [[ ! "$PIN_LINE" =~ ([^[:space:]]+@sha256:[0-9a-f]{64}) ]]; then
    continue
  fi
  TOKEN="${BASH_REMATCH[1]}"
  TAG="${TOKEN%@*}"
  PINNED_DIGEST="${TOKEN##*@}"
  COUNT=$((COUNT + 1))

  # 同一 tag 的多处 pin 必须一致（node ×3、postgres ×3、redis ×3）
  if [[ -n "${PINNED_OF[$TAG]+x}" && "${PINNED_OF[$TAG]}" != "$PINNED_DIGEST" ]]; then
    echo "[check-digests] 同一 tag pin 不一致：${SRC}:${LINE_NO} $TAG" >&2
    echo "  当前: $PINNED_DIGEST" >&2
    echo "  他处: ${PINNED_OF[$TAG]}" >&2
    STATUS=1
    continue
  fi
  PINNED_OF[$TAG]="$PINNED_DIGEST"

  LATEST=$(docker buildx imagetools inspect "$TAG" 2>/dev/null | grep -E '^Digest:' | head -n1 | awk '{print $2}' || true)
  if [[ -z "$LATEST" ]]; then
    echo "[check-digests] 远端 digest 获取失败：$TAG（请确认 Docker Desktop 运行且网络可达）" >&2
    STATUS=1
    continue
  fi
  if [[ "$LATEST" != "$PINNED_DIGEST" ]]; then
    echo "[check-digests] 漂移：${SRC}:${LINE_NO} $TAG" >&2
    echo "  pin   : $PINNED_DIGEST" >&2
    echo "  latest: $LATEST" >&2
    STATUS=1
  fi
done <<<"$PINS"

if [[ "$COUNT" -ne 10 ]]; then
  echo "[check-digests] pin 数量异常：预期 10，实际 ${COUNT}（可能有 pin 被移除）" >&2
  exit 1
fi

if [[ "$STATUS" -eq 0 ]]; then
  echo "[check-digests] 全部一致（共 $COUNT 处 pin）"
fi
exit "$STATUS"