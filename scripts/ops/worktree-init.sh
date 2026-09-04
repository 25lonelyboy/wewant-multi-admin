#!/usr/bin/env bash
# worktree-init.sh — 通用仓库就绪脚本（零依赖：bash + git + 探测到的包管理器）
#
# 双场景自动判定：.git 为目录 = 主仓库模式（新克隆引导）；.git 为文件 = worktree 模式。
# 调用约定：自仓库根以相对路径调用（bash scripts/ops/worktree-init.sh）。
# 行为边界：不启动服务、不执行领域命令（prisma/playwright 等）、不做除模式判定外的
#           git 变更操作。详见同任务目录设计文档。
#
# 退出码：0=就绪（含非 Node 栈指引路径） 1=环境/版本不满足
#         2=依赖安装失败               3=未识别技术栈或不在 git 仓库内
set -euo pipefail

CURRENT_STEP='启动'
declare -a COMPLETED_STEPS=()
EXIT_CODE=0

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"

fail() {
  local rc=${1:-1}
  echo "[FAIL] 步骤「${CURRENT_STEP}」失败 (exit ${rc})；已完成：${COMPLETED_STEPS[*]:-无}" >&2
  exit "$rc"
}
trap 'fail $?' ERR

step() {
  CURRENT_STEP="$1"
  echo ""
  echo "==> $1"
}

ok() { echo "    [ok] $1"; }

warn() { echo "    [warn] $1" >&2; }

step_done() { COMPLETED_STEPS+=("$1"); }

cd "$ROOT"

# git 仓库校验：必须退出码 3（未识别技术栈或不在 git 仓库内），不能用 set -e 默认退出码 1
# （ERR trap 会抢在 if 之前以 rc=1 触发，掩盖预期的退出码 3）
_git_rc=0
git rev-parse --show-toplevel >/dev/null 2>&1 || _git_rc=$?
if [ "$_git_rc" -ne 0 ]; then
  echo "[FAIL] 当前不在 git 仓库内：$ROOT" >&2
  exit 3
fi

if [ -d .git ]; then
  MODE='main'
  MAIN_REPO="$ROOT"
else
  MODE='worktree'
  # worktree 的 .git 文件内容恒为 "gitdir: <主仓库>/.git/worktrees/<名>"，上三级即主仓库根
  gitdir="$(sed 's/^gitdir: //' .git)"
  MAIN_REPO="$(cd "$gitdir/../../.." && pwd)"
fi

step "[1/5] 定位与模式判定"
if [ "$MODE" = 'worktree' ]; then
  ok "worktree 模式：$ROOT（主仓库：$MAIN_REPO）"
else
  ok "主仓库模式：$ROOT"
fi
step_done '定位与模式判定'

exit "$EXIT_CODE"
