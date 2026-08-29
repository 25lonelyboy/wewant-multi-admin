#!/usr/bin/env bash
set -euo pipefail

# pure-web 上游漂移报告（设计 4 章）
# 用法：bash scripts/ops/upstream-diff.sh [baseline-sha] [target-ref]
#   baseline-sha 省略 → 无基线模式：仅产出本地侧变更清单
#   target-ref 默认 upstream/main
# 输出：docs/tasks/2026-08-29-pure-web-testing-foundation/upstream-diff/ 三件套

LOCAL_BASE="${LOCAL_BASE:-94a2cf9}" # pure-web template 接入提交（可用 git log 复核）
BASE="${1:-}"
TARGET="${2:-upstream/main}"
OUT_DIR="${OUT_DIR:-docs/tasks/2026-08-29-pure-web-testing-foundation/upstream-diff}"
WEB_DIR="apps/pure-web"

echo "▶ 确保 upstream remote 并 fetch..."
if ! git remote get-url upstream >/dev/null 2>&1; then
  git remote add upstream https://github.com/pure-admin/vue-pure-admin.git
fi
git fetch upstream --tags --quiet

mkdir -p "$OUT_DIR"

echo "▶ 本地侧变更清单（自接入提交 ${LOCAL_BASE}）..."
git diff --name-only "${LOCAL_BASE}..HEAD" -- "$WEB_DIR" |
  sed "s|^${WEB_DIR}/||" | sort -u >"$OUT_DIR/local-changed.txt"
echo "  本地变更文件数：$(wc -l <"$OUT_DIR/local-changed.txt")"

if [ -z "$BASE" ]; then
  echo "⚠ 未提供基线，无基线模式：跳过上游差异分析"
  echo "✔ 输出目录：$OUT_DIR（仅 local-changed.txt）"
  exit 0
fi

echo "▶ 上游改动清单（${BASE}..${TARGET}，四类切分）..."
git log --oneline "${BASE}..${TARGET}" -- src/layout >"$OUT_DIR/upstream-log-layout.txt"
git log --oneline "${BASE}..${TARGET}" -- src/components >"$OUT_DIR/upstream-log-components.txt"
git log --oneline "${BASE}..${TARGET}" -- src/utils src/router src/store src/config src/plugins src/directives build mock >"$OUT_DIR/upstream-log-utils-src.txt"
git log --oneline "${BASE}..${TARGET}" -- package.json >"$OUT_DIR/upstream-log-deps.txt"

echo "▶ 文件变更地图..."
git diff --stat --find-renames "${BASE}..${TARGET}" >"$OUT_DIR/diff-stat.txt"
git diff --name-status --find-renames "${BASE}..${TARGET}" >"$OUT_DIR/diff-name-status.txt"

echo "▶ 冲突面清单（两方改动交集）..."
git diff --name-only --find-renames "${BASE}..${TARGET}" | sort -u >"$OUT_DIR/upstream-changed.txt"
comm -12 "$OUT_DIR/local-changed.txt" "$OUT_DIR/upstream-changed.txt" >"$OUT_DIR/conflict-surface.txt"

echo "✔ 三件套输出完成：$OUT_DIR"
echo "  上游变更文件数：$(wc -l <"$OUT_DIR/upstream-changed.txt")"
echo "  冲突面文件数：$(wc -l <"$OUT_DIR/conflict-surface.txt")"
