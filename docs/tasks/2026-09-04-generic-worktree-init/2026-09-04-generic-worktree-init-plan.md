# 通用 worktree 初始化脚本实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 交付通用零依赖的 `scripts/ops/worktree-init.sh`（worktree 初始化 + 新克隆引导双场景），删除旧 `scripts/worktree-init.ps1`，完成文档登记与本仓库全链路实测。

**Architecture:** 单 bash 脚本按 `.git` 类型自动判定模式；五步链（定位 → 技术栈探测 → engines 校验 → 依赖安装 → 机器级文件 + 钩子兜底）。脚本按函数分节增量构建，每节用临时 fixture 仓库验证后再并入。

**Tech Stack:** bash（本机经 WSL GNU bash 5.2.21 执行）、git、node（仅作 package.json JSON 读取器）、探测到的包管理器。

**设计文档：** [2026-09-04-generic-worktree-init-design.md](2026-09-04-generic-worktree-init-design.md)（含 8 项锁定决策与验收用例，冲突时以设计文档为准并回报）。

**全局约定：**

- 所有命令自仓库根 `d:\WorkSpace\AI\wewant-multi-admin` 以相对路径执行（设计 §7 调用约定）；本机经 WSL bash 运行 `.sh`。
- 提交信息：`feat(repo): ...` / `chore(repo): ...` / `docs(repo): ...`（scope `repo` 在白名单）。
- 每次提交前 `npx prettier --write <本次改动的 md/json>`；bash 文件不进 prettier 写入范围。
- 设计边界铁律：不启动服务、不执行领域命令（prisma / playwright）、不修改已跟踪文件内容之外的仓库状态、不做任何 `git worktree add` 之外的 git 变更操作。
- fixture 一律建在系统临时目录（`mktemp -d`），任务结束清理，不进仓库。
- **fixture 命令必须在 WSL bash 会话内执行**（或 `bash -c '...'` 包裹）：`mktemp` / `sed -i` 等不是 PowerShell 命令。进 fixture 前先在仓库根派生仓库根变量：`REPO="$(git rev-parse --show-toplevel)"`（WSL 内为 `/mnt/d/...` 路径），后续 fixture 步骤统一引用 `$REPO`。

---

### Task 0: 脚本骨架——定位、模式判定、退出码与日志结构

**Files:**

- Create: `scripts/ops/worktree-init.sh`

- [ ] **Step 1: 创建骨架脚本**

```bash
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
```

- [ ] **Step 2: 主仓库模式冒烟**

Run: `bash scripts/ops/worktree-init.sh`
Expected: 输出 `==> [1/5] 定位与模式判定` 与 `[ok] 主仓库模式：<仓库根绝对路径>`，退出码 0（`echo $?`）。

- [ ] **Step 3: worktree 模式冒烟（含设计 §7 第 5 条首验）**

Run:

```bash
git worktree add .worktrees/skeleton-check -b tmp/skeleton-check
bash .worktrees/skeleton-check/scripts/ops/worktree-init.sh
git worktree remove .worktrees/skeleton-check
git branch -D tmp/skeleton-check
```

Expected: 输出 `[ok] worktree 模式：<worktree 路径>（主仓库：<主仓库路径>）`，两个路径均真实存在（主仓库路径 = 本仓库根）；清理两条命令无报错。**若主仓库路径解析异常（如出现 `D:\` 风格或 `.git/..` 残留），停止后续任务并回报**——这是设计标记的未实证风险点。

- [ ] **Step 4: 非 git 目录退出码 3**

Run:

```bash
tmpdir=$(mktemp -d)
mkdir -p "$tmpdir/fake/scripts/ops"
cp scripts/ops/worktree-init.sh "$tmpdir/fake/scripts/ops/"
bash "$tmpdir/fake/scripts/ops/worktree-init.sh"; echo "exit=$?"
rm -rf "$tmpdir"
```

Expected: `[FAIL] 当前不在 git 仓库内`，`exit=3`。

- [ ] **Step 5: Commit**

```bash
git add scripts/ops/worktree-init.sh
git commit -m "feat(repo): worktree-init 脚本骨架——模式自动判定与退出码结构"
```

---

### Task 1: 技术栈探测与包管理器选择

**Files:**

- Modify: `scripts/ops/worktree-init.sh`（新增函数 + 替换尾部占位 `exit "$EXIT_CODE"`）

- [ ] **Step 1: 插入探测函数**

在骨架的 `cd "$ROOT"` 行**之前**插入以下函数：

```bash
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
```

说明：`detect_pm` 内的 `exit` 发生在命令替换子 shell 中，赋值语句失败后由 `set -e` 触发 trap——函数内错误消息与 trap 诊断会重复打印，属预期行为，退出码不受影响。

- [ ] **Step 2: 替换尾部占位**

把骨架末尾的 `exit "$EXIT_CODE"` 替换为：

```bash
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

exit "$EXIT_CODE"
```

- [ ] **Step 3: fixture——packageManager 优先**

Run:

```bash
f=$(mktemp -d); cd "$f"; git init -q
printf '{"name":"fx","packageManager":"pnpm@11.18.0"}\n' > package.json
printf 'pnpm-lock.yaml\n' > pnpm-lock.yaml
mkdir -p scripts/ops && cp "$REPO/scripts/ops/worktree-init.sh" scripts/ops/
bash scripts/ops/worktree-init.sh; echo "exit=$?"
```

Expected: `[ok] Node 项目，包管理器：pnpm`，`exit=0`。

- [ ] **Step 4: fixture——多 lockfile 告警 + 无 lockfile 拒绝**

Run（承接上目录）:

```bash
touch package-lock.json
bash scripts/ops/worktree-init.sh 2>&1 | grep -c warn   # 预期 ≥1（多 lockfile 告警），仍选 pnpm
rm pnpm-lock.yaml package-lock.json
printf '{"name":"fx"}\n' > package.json
bash scripts/ops/worktree-init.sh; echo "exit=$?"
```

Expected: 无 lockfile 无 packageManager 时输出「拒绝猜测」，`exit=3`。

- [ ] **Step 5: fixture——非 Node 栈指引路径**

Run:

```bash
cd "$f"; rm -rf package.json scripts; touch requirements.txt
mkdir -p scripts/ops && cp "$REPO/scripts/ops/worktree-init.sh" scripts/ops/
bash scripts/ops/worktree-init.sh; echo "exit=$?"
rm -rf "$f"
```

Expected: `检测到非 Node 栈：python` + venv 指引，`exit=0`。

- [ ] **Step 6: 本仓库回归**

Run: `bash scripts/ops/worktree-init.sh`
Expected: `[ok] Node 项目，包管理器：pnpm`（根 `packageManager: pnpm@11.18.0` 命中优先级 1），`exit=0`。

- [ ] **Step 7: Commit**

```bash
git add scripts/ops/worktree-init.sh
git commit -m "feat(repo): worktree-init 技术栈探测与包管理器三级优先级"
```

---

### Task 2: engines 校验与依赖安装

**Files:**

- Modify: `scripts/ops/worktree-init.sh`（新增 `version_ge` / `check_engines` / `run_install` + 替换尾部占位）

- [ ] **Step 1: 插入校验与安装函数**

在 Task 1 新增函数的末尾插入：

```bash
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
```

注意 `json_field` 对点路径中途缺失的字段返回空串（循环内判空），无需额外判空。

- [ ] **Step 2: 替换尾部占位**

把 Task 1 留下的尾部 `exit "$EXIT_CODE"` 替换为：

```bash
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
```

注意：`if run_install` 上下文中 `set -e` 不生效于条件内，失败走 else 分支 exit 2，trap 不抢先。

- [ ] **Step 3: fixture——engines 不满足（exit 1）**

Run:

```bash
f=$(mktemp -d); cd "$f"; git init -q
printf '{"name":"fx","engines":{"node":">=99"}}\n' > package.json
printf 'package-lock.json\n' > package-lock.json
mkdir -p scripts/ops && cp "$REPO/scripts/ops/worktree-init.sh" scripts/ops/
bash scripts/ops/worktree-init.sh; echo "exit=$?"
```

Expected: `[FAIL] engines.node='>=99'：本机 <版本> 不满足`，`exit=1`。

- [ ] **Step 4: fixture——无 engines 跳过 + 真实安装（exit 0）**

Run:

```bash
printf '{"name":"fx"}\n' > package.json
bash scripts/ops/worktree-init.sh; echo "exit=$?"
test -d node_modules && echo has-node_modules
```

Expected: 校验步静默跳过（无 engines 行），`npm install` 执行，`exit=0`，`has-node_modules`。

- [ ] **Step 5: fixture——复杂范围告警不阻断 + 清理**

Run:

```bash
printf '{"name":"fx","engines":{"node":">=18 || >=20"}}\n' > package.json
bash scripts/ops/worktree-init.sh 2>&1 | grep -m1 warn
rm -rf "$f"
```

Expected: `[warn] engines.node='>=18 || >=20' 为复杂范围，跳过该项校验（不阻断）`，脚本最终 `exit=0`。

- [ ] **Step 6: Commit**

```bash
git add scripts/ops/worktree-init.sh
git commit -m "feat(repo): worktree-init engines 自适应校验与依赖安装"
```

---

### Task 3: 机器级文件步骤与钩子兜底

**Files:**

- Modify: `scripts/ops/worktree-init.sh`（新增 `sync_env_files` / `bootstrap_env` / `ensure_hooks` + 替换尾部占位）

- [ ] **Step 1: 插入函数**

在 Task 2 新增函数的末尾插入：

```bash
sync_env_files() {
  local copied=0 skipped=0 f base check=1
  git -C "$MAIN_REPO" check-ignore --version >/dev/null 2>&1 || check=0
  [ "$check" -eq 0 ] && warn 'git check-ignore 不可用，降级为仅模式匹配'
  while IFS= read -r f; do
    base="$(basename "$f")"
    case "$base" in
      .env | .env.* | *.local) ;;
      *) continue ;;
    esac
    if [ "$check" -eq 1 ] && ! git -C "$MAIN_REPO" check-ignore -q "$base"; then
      continue  # 未被 gitignore = 已跟踪或普通文件，不同步
    fi
    if [ -e "$base" ]; then
      skipped=$((skipped + 1))
      ok "已存在，跳过：$base"
    else
      cp "$MAIN_REPO/$base" "$base"
      copied=$((copied + 1))
      ok "已复制：$base（来源：主仓库）"
    fi
  done < <(cd "$MAIN_REPO" && find . -maxdepth 1 -type f \
           \( -name '.env' -o -name '.env.*' -o -name '*.local' \) | sort -u)
  ok "env 类文件同步完成：复制 $copied，跳过 $skipped（.env.local 双模式命中由 sort -u 去重）"
}

bootstrap_env() {
  if [ ! -e .env ] && [ -f .env.example ]; then
    cp .env.example .env
    warn '已从 .env.example 生成 .env——请核对值是否需要本地修改'
  fi
}

ensure_hooks() {
  [ -d .husky ] || { ok '无 .husky/，钩子兜底跳过'; return 0; }
  if [ -n "$(git config core.hooksPath || true)" ]; then
    ok "hooksPath 已设置：$(git config core.hooksPath)"
    return 0
  fi
  if json_field scripts.prepare | grep -q husky; then
    if "$PM" run prepare; then
      ok "钩子已初始化（$PM run prepare）"
    else
      warn '钩子初始化失败（prepare 执行报错），请手工处理'
    fi
  else
    warn '存在 .husky/ 但无 husky prepare script，请手工设置钩子'
  fi
}
```

- [ ] **Step 2: 替换尾部占位**

把 Task 2 留下的尾部 `exit "$EXIT_CODE"` 替换为：

```bash
step "[5/5] 机器级文件与钩子兜底"
if [ "$MODE" = 'worktree' ]; then
  sync_env_files
else
  bootstrap_env
fi
ensure_hooks
step_done '机器级文件与钩子兜底'

echo ""
echo "仓库就绪：$ROOT"
[ "$MODE" = 'worktree' ] && echo '后端开发前记得：docker compose up -d postgres redis（或等价的环境启动命令）'
```

- [ ] **Step 3: 本仓库根模式冒烟（.env 已存在路径）**

Run: `bash scripts/ops/worktree-init.sh; echo "exit=$?"`
Expected: 步骤 5 输出 `已存在，跳过`类信息不出现（主仓库走 `bootstrap_env`，`.env` 已存在故静默跳过）+ `hooksPath 已设置：.husky/_`（本仓库 husky 已初始化），尾部 `仓库就绪`，`exit=0`。

- [ ] **Step 4: Commit**

```bash
git add scripts/ops/worktree-init.sh
git commit -m "feat(repo): worktree-init 机器级文件白名单同步与钩子兜底"
```

---

### Task 4: 本仓库全链路实测与幂等验证（设计验收用例 1 + 5）

**Files:** 无文件改动（纯验证任务；发现问题则修脚本并追加提交）

- [ ] **Step 1: 建真实 worktree**

Run: `git worktree add .worktrees/smoke-init -b tmp/smoke-init`

- [ ] **Step 2: worktree 内全链路执行**

Run: `bash .worktrees/smoke-init/scripts/ops/worktree-init.sh`
Expected（逐项核对，任一不符即停并回报）：
- `[1/5]`：主仓库路径反推正确（§7 第 5 条实测项，路径可直接消费、无 `D:\` 残留）；
- `[2/5]`：`包管理器：pnpm`（探测源为 worktree 自身的 `package.json`）；
- `[3/5]`：`engines.node='>=24'` 与 `engines.pnpm='>=11'` 两行均「满足」；
- `[4/5]`：`pnpm install` 成功（耗时不作断言：相对路径 `store-dir=.pnpm-store` 可能解析为 worktree 本地存储，属本任务观察项）；
- `[5/5]`：`.env` 从主仓库复制（首跑），`[ok] hooksPath` 行出现（worktree 首跑可能走 `pnpm run prepare` 初始化路径，两形态均可）；
- 核对 `.worktrees/smoke-init/.env` 与主仓库 `.env` 内容一致（`diff` 无输出）。

- [ ] **Step 3: 幂等验证（设计验收用例 5）**

Run: `bash .worktrees/smoke-init/scripts/ops/worktree-init.sh; echo "exit=$?"`
Expected: 再次成功，`.env` 步变为「已存在，跳过」，`exit=0`。

- [ ] **Step 4: 清理**

Run:

```bash
git worktree remove .worktrees/smoke-init --force
git branch -D tmp/smoke-init
```

Expected: 无报错，`git worktree list` 仅剩主仓库（`remove` 输出无残留告警；若告警 node_modules / `.pnpm-store` 残留，确认 `--force` 已生效即可）。

- [ ] **Step 5: 若本任务产生脚本修复**

修复后重跑 Step 2-3，然后：

```bash
git add scripts/ops/worktree-init.sh
git commit -m "fix(repo): worktree-init 全链路实测修复"
```

---

### Task 5: 旧脚本删除、文档登记与收口（设计 §九 + D7）

**Files:**

- Delete: `scripts/worktree-init.ps1`
- Modify: `package.json`（scripts 区）
- Modify: `docs/engineering/build-and-verify.md`（ops 表）
- Modify: `docs/tasks/2026-09-04-generic-worktree-init/README.md`（索引）
- Modify: `docs/tasks/README.md`（热索引行）

- [ ] **Step 1: 登记 package.json**

在根 `package.json` 的 `ops:upstream-diff` 行之后加一行（保持现有缩进与逗号风格）：

```json
"ops:worktree-init": "bash scripts/ops/worktree-init.sh",
```

- [ ] **Step 2: 登记 build-and-verify.md ops 表**

在 `docs/engineering/build-and-verify.md` ops 表 `pnpm ops:upstream-diff` 行之后加一行：

```markdown
| `pnpm ops:worktree-init` | `worktree-init.sh` | 通用仓库就绪：`.git` 类型自动判定双场景（worktree 检出后初始化：依赖安装 + 主仓库 env 类文件白名单同步 + 钩子兜底；新克隆引导：技术栈探测 + `.env.example` 生成）；零依赖单文件，可复制到其他仓库；engines 校验读目标仓库 `package.json`；Windows 下经 WSL bash 执行，调用方须自仓库根以相对路径调用 |
```

- [ ] **Step 3: 删除旧脚本并验证入口**

```bash
rm scripts/worktree-init.ps1
pnpm ops:worktree-init; echo "exit=$?"
```

Expected: ps1 已删除；`pnpm ops:worktree-init` 走通主仓库模式 `仓库就绪`，`exit=0`。

- [ ] **Step 4: 任务目录与热索引收口**

`docs/tasks/2026-09-04-generic-worktree-init/README.md` 状态行改为「实施完成，待归档」（计划行已在计划落盘时登记，不重复添加）。

`docs/tasks/README.md` 进行中表的任务行收口说明改为：「实施完成：`scripts/ops/worktree-init.sh` 落地（双场景实测全绿），旧 ps1 已删除，登记 → build-and-verify.md（链接沿用该表现有行的 `../engineering/build-and-verify.md` 相对层级）」。

- [ ] **Step 5: 质量门禁**

Run:

```bash
npx prettier --write package.json docs/engineering/build-and-verify.md docs/tasks/2026-09-04-generic-worktree-init/README.md docs/tasks/README.md
node scripts/doc-lint.cjs .
```

Expected: prettier 无报错；doc-lint ①孤儿 ②死链 ③frontmatter ⑤行数全绿（④漂移仅剩 `backend-evolution.md` / `repo-structure.md` 两项既有告警，与本任务无关，不处理）。

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "chore(repo): worktree-init 收口——删除旧 ps1 与文档登记"
```

注意：`git add -A` 前先用 `git status --short` 确认工作区只有本任务文件（历史教训：lint-staged 钩子期可能把未跟踪文件带入提交，提交后用 `git show --stat HEAD` 核对文件清单）。

---

## 自审记录

- 规格覆盖：设计 §三（五步链）→ Task 0-3；§四（探测/校验）→ Task 1-2；§五（文件/钩子细节）→ Task 3；§六（退出码/幂等）→ Task 0/2/4；§七（WSL 约束）→ Task 0 Step 3 + Task 4 Step 2；§八（五验收用例）→ Task 2（engines 三态）/ Task 1（非 Node 栈）/ Task 4（worktree 全链路 + 幂等）；根模式 `.env` 生成用例因本仓库 `.env` 已存在无法直接实测，以 Task 2 fixture（干净临时仓库 + `.env` 生成路径同构的 bootstrap_env）覆盖逻辑，真实克隆场景留待首次真实新克隆时观察——已在计划内明示，不视为缺口。§九（登记）→ Task 5；D7 → Task 5 Step 3。
- 无占位符；各任务函数名一致（`json_field` / `detect_stack` / `detect_pm` / `version_ge` / `check_engines` / `run_install` / `sync_env_files` / `bootstrap_env` / `ensure_hooks`）。
- 2026-09-04 计划审查修正：C-1 `json_field` 改 argv 点路径传参（原实现 ReferenceError 被静默吞掉）；C-2 `detect_stack` python 拼接修复；C-3 `check-ignore` 可用性探测改 `--version`（`--help` 会开分页器卡死）；C-4 主仓库反推改 `--absolute-git-dir` 上两级（不依赖 `--git-common-dir` 输出形态）；I-1 fixture shell 上下文声明 + `$REPO` 派生；M-1 子 shell 重复诊断加注；M-2 共享 store 预期降级为观察项；M-3 fixture 改写统一直写 `printf`。
- 2026-09-05 Task 0 实现期发现（C-5，两项）：①git 2.43.0 WSL 环境下 `--absolute-git-dir` 在 linked worktree 中返回 common dir（`<主仓库>/.git`）而非 worktree gitdir（`<主仓库>/.git/worktrees/<名>`），与设计假设不符——改为解析 `.git` 文件的 `gitdir:` 行，上**三级**（worktrees/`<名>` → worktrees/ → .git/ → 主仓库根）；②`if ! git rev-parse ...` 模式与 `set -e` + ERR trap 配合时，trap 会以 rc=1 **先于** if 的 `exit 3` 触发，掩盖预期退出码——改为显式 `_git_rc=0; git ... || _git_rc=$?` 捕获。两处均已落实到脚本骨架与计划 Task 0 代码块。
- 2026-09-05 Task 1 实现期发现（C-6，一项）：Step 2 代码 `${STACK#+}` 仅剥离前缀 `+`，对 `unknown+python` 无效（bash `#` 剥离最短前缀，字符串不以 `+` 开头时不起作用），导致非 Node 单栈输出 `unknown+python` 而非预期的 `python`——改为 `${STACK#unknown+}`（剥离前缀 `unknown+`，混合栈 `node+python` 不受影响）。已落实到脚本 Task 1 代码块。
- 已知实现注意：`.env.local` 双模式命中由 `sort -u` 去重（Task 3 注释已标注）。
