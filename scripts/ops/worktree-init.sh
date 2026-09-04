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

# 打印当前目录 package.json 的点路径字段值（缺失输出空串）；$1 = 点路径（如 engines.node）
json_field() {
  node -p "let v=require('./package.json');for(const k of process.argv[1].split('.')){v=(v==null)?null:v[k]}v==null?'':String(v)" "$1" 2>/dev/null || true
}

detect_stack() {
  # 探测对象 = 当前工作区自身根（worktree 检出的是其分支内容，不用主仓库工作区）
  STACK='unknown'
  PM=''
  [ -f package.json ] && STACK='node'
  if [ -f requirements.txt ] || [ -f pyproject.toml ] || [ -f poetry.lock ]; then
    STACK="${STACK}+python"
  fi
  [ -f go.mod ] && STACK="${STACK}+go"
  [ -f Cargo.toml ] && STACK="${STACK}+rust"
  { [ -f pom.xml ] || [ -f build.gradle ] || [ -f build.gradle.kts ]; } && STACK="${STACK}+jvm"
  case "$STACK" in
    node*) PM="$(detect_pm)" ;;
  esac
}

detect_pm() {
  local field name=''
  field="$(json_field packageManager)"
  if [ -n "$field" ]; then
    name="${field%%@*}"
  else
    local found=()
    [ -f pnpm-lock.yaml ] && found+=(pnpm)
    [ -f yarn.lock ] && found+=(yarn)
    [ -f package-lock.json ] && found+=(npm)
    { [ -f bun.lockb ] || [ -f bun.lock ]; } && found+=(bun)
    if [ "${#found[@]}" -eq 0 ]; then
      echo "[FAIL] 存在 package.json 但无 packageManager 字段与任何 lockfile，拒绝猜测（防产生错误 lock 文件）" >&2
      exit 3
    fi
    [ "${#found[@]}" -gt 1 ] && warn "多 lockfile 并存（${found[*]}），按固定顺序取 ${found[0]}；建议提交 packageManager 字段消除歧义"
    name="${found[0]}"
  fi
  command -v "$name" >/dev/null 2>&1 || {
    echo "[FAIL] 包管理器 $name 未安装" >&2
    exit 1
  }
  echo "$name"
}

# 数字元组比较：current >= required 则返回 0
version_ge() {
  local IFS=.
  local i cur=($1) req=($2)
  for i in 0 1 2; do
    local c=${cur[i]:-0} r=${req[i]:-0}
    ((10#$c > 10#$r)) && return 0
    ((10#$c < 10#$r)) && return 1
  done
  return 0
}

check_engines() {
  command -v node >/dev/null 2>&1 || {
    echo "[FAIL] 未找到 node（Node 仓库必需，也是本脚本的 package.json 读取器）" >&2
    exit 1
  }
  local raw pair name range actual
  for pair in "node:$(json_field engines.node)" \
              "$PM:$(json_field "engines.$PM")"; do
    name="${pair%%:*}"
    range="${pair#*:}"
    [ -z "$range" ] && continue
    case "$range" in
      *'||'* | *' - '* | *x* | *X* | *\**)
        warn "engines.$name='$range' 为复杂范围，跳过该项校验（不阻断）"
        continue ;;
    esac
    actual="$(node -v | sed 's/^v//')"
    [ "$name" = "$PM" ] && actual="$("$PM" -v | head -1 | sed 's/^v//')"
    local min
    min="$(printf '%s' "$range" | sed -E 's/^[^0-9]*([0-9]+(\.[0-9]+){0,2}).*/\1/')"
    if version_ge "$actual" "$min"; then
      ok "engines.$name='$range'：本机 $actual 满足"
    else
      echo "[FAIL] engines.$name='$range'：本机 $actual 不满足" >&2
      exit 1
    fi
  done
}

run_install() {
  case "$PM" in
    pnpm) pnpm install ;;
    npm) npm install ;;
    yarn) yarn install ;;
    bun) bun install ;;
  esac
}

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

step "[2/5] 技术栈探测"
detect_stack
case "$STACK" in
  node*) ok "Node 项目，包管理器：$PM" ;;
  unknown) echo "[FAIL] 未识别技术栈：$ROOT" >&2; exit 3 ;;
  *) ok "检测到非 Node 栈：${STACK#unknown+}（仅打印指引，不代为执行）" ;;
esac
step_done '技术栈探测'

if [[ "$STACK" != node* ]]; then
  case "$STACK" in
    *python*) echo "    指引：python -m venv .venv && .venv/bin/pip install -r requirements.txt（或 poetry install）" ;;
    *go*) echo "    指引：go mod download" ;;
    *rust*) echo "    指引：cargo build" ;;
    *jvm*) echo "    指引：mvn install 或 ./gradlew build" ;;
  esac
  exit 0
fi

step "[3/5] 环境版本校验"
check_engines
step_done '环境版本校验'

step "[4/5] 依赖安装"
if run_install; then
  ok "$PM install 完成"
  step_done '依赖安装'
else
  echo "[FAIL] 依赖安装失败（$PM install）" >&2
  exit 2
fi

exit "$EXIT_CODE"
