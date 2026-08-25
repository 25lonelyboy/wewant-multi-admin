#!/usr/bin/env bash
set -euo pipefail

# CI 失败日志导出：导出失败 job 日志到本地文件，供 Agent 分析
# 用法：bash scripts/ops/ci-logs.sh [run_id]
# 产物：scripts/ops/.ci-failure-<run_id>.log

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# 前置：检查 gh 认证
if ! gh auth status >/dev/null 2>&1; then
  echo "✖ gh 未认证。请先运行：gh auth login"
  exit 1
fi

if [ -n "${1:-}" ]; then
  run_id="$1"
else
  # 自动查找最新失败的 run
  echo "▶ 查找最新失败的 CI run..."
  run_id=$(gh run list --workflow=CI --limit=10 --json databaseId,conclusion \
    --jq '[.[] | select(.conclusion == "failure")][0].databaseId // empty')

  if [ -z "$run_id" ]; then
    echo "✔ 最近 10 次 CI run 均无失败"
    exit 0
  fi
  echo "  找到失败 run #${run_id}"
fi

output="${SCRIPT_DIR}/.ci-failure-${run_id}.log"

echo "▶ 导出失败日志到 ${output}..."
gh run view "$run_id" --log-failed > "$output" 2>/dev/null || {
  echo "✖ 无失败日志可导出（run #${run_id} 可能全部通过或 run 不存在）"
  rm -f "$output"
  exit 1
}

# 输出摘要
lines=$(wc -l < "$output" | tr -d ' ')

echo ""
echo "✔ 日志已导出"
echo "  文件：${output}"
echo "  行数：${lines}"
echo ""
echo "Agent 可直接读取该文件进行分析。"
