#!/usr/bin/env bash
set -euo pipefail

# CI 结果拉取：获取最新 CI 运行状态，失败时自动打印日志
# 用法：bash scripts/ops/ci-status.sh [run_id]

# 前置：检查 gh 认证
if ! gh auth status >/dev/null 2>&1; then
  echo "✖ gh 未认证。请先运行：gh auth login"
  exit 1
fi

if [ -n "${1:-}" ]; then
  # 指定 run_id
  run_id="$1"
  echo "▶ 查看 CI run #${run_id}..."
  echo ""
  gh run view "$run_id" --json jobs --jq '
    .jobs[] | "  \(.name)  \(.status)  \(.conclusion // "-")  \(.startedAt)"
  '

  # 检查是否有失败 job
  failed=$(gh run view "$run_id" --json jobs --jq '[.jobs[] | select(.conclusion == "failure")] | length')
  if [ "$failed" -gt 0 ]; then
    echo ""
    echo "▶ 失败 job 日志（最后 50 行）："
    gh run view "$run_id" --log-failed 2>/dev/null | tail -50 || true
  fi
else
  # 默认：最近 5 次
  echo "▶ 最近 CI 运行："
  echo ""
  gh run list --workflow=CI --limit=5 --json databaseId,status,conclusion,createdAt,headBranch --jq '
    .[] | "  #\(.databaseId)  \(.status)  \(.conclusion // "-")  \(.headBranch)  \(.createdAt)"
  '

  # 取最新一次 run，检查是否有失败
  latest=$(gh run list --workflow=CI --limit=1 --json conclusion,databaseId --jq '.[0] | "\(.conclusion // "") \(.databaseId)"')
  conclusion="${latest%% *}"
  id="${latest##* }"

  if [ "$conclusion" = "failure" ]; then
    echo ""
    echo "▶ 最新 run #${id} 有失败，拉取失败日志（最后 50 行）："
    gh run view "$id" --log-failed 2>/dev/null | tail -50 || true
  fi
fi
