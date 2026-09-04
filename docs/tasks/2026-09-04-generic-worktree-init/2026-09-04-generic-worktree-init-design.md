# 通用 worktree 初始化脚本设计

> 状态：设计已确认（2026-09-04 头脑风暴逐项澄清 + 同日审查修正），待实施。
> 起点：`scripts/worktree-init.ps1`（未跟踪、Windows/PowerShell 限定、硬编码本仓库版本约束），评估结论见文末背景。
> 2026-09-04 审查修正：I-1 探测目标改为 worktree 自身 / I-2 git 路径降级为实测项 / M-1 调用约定 / M-2 复杂范围语义 / M-3 措辞统一 / M-4 命名权衡（D8）。

## 一、目标与范围

将现有 ps1 改造为**通用、零依赖、跨平台**的仓库就绪脚本，覆盖两个场景：

1. **worktree 检出后初始化**（场景 A）：装依赖、从主仓库同步机器级文件、钩子兜底——沿用本仓库 6 次 worktree 会话（quickwins / lockout / security-baseline / image-smoke / B3 / B4）每次手工执行的初始化步骤；
2. **新克隆仓库引导**（场景 B）：检测技术栈、装依赖、`.env` 生成。

复用边界：可在其他操作系统、新拉取的仓库、非本项目仓库中使用（单文件复制即用）。

**支持深度分层**（澄清结论）：

- Node 生态：深度支持（环境校验 + 依赖安装）；
- 非 Node 栈（Python / Go / Rust / JVM）：浅支持——仅检测 + 打印手工指引，绝不代为执行；
- 不做「所有技术栈全自动安装」——那会成为依赖管理工具，范围失控。

## 二、锁定决策（澄清记录）

| # | 决策点 | 结论 | 理由 |
|---|---|---|---|
| D1 | 目标场景 | 双场景（worktree 初始化 + 新克隆引导） | 用户选择；场景 B 按支持深度分层收敛 |
| D2 | 载体语言 | Bash `.sh` | 与现有 `scripts/ops/*.sh`（8 个，全部 `bash scripts/ops/xxx.sh` 调用）同构；零依赖 |
| D3 | 模式组织 | 单脚本自动判定（方案 A） | `.git` 类型是 git 硬事实无误判空间；调用者自声明模式（方案 B）是软信息，subagent 场景易传错；函数库拆分（方案 C）对单文件分发是负资产 |
| D4 | 文件同步范围 | 仅 env 类文件（`.env` / `.env.*` / `*.local`），且须被主仓库 gitignore、目标缺失时才复制，绝不覆盖 | 最窄面，误伤风险最低 |
| D5 | 版本校验策略 | 读目标仓库 `package.json` `engines`；无该字段则跳过 | 对任意 Node 仓库自适应，去掉硬编码 |
| D6 | 存放分发 | 落本仓库 `scripts/ops/worktree-init.sh` + 登记（build-and-verify.md + package.json `ops:` 脚本） | 未跟踪脚本不随 `git worktree add` 检出——这是旧脚本的致命缺陷；登记保证可发现性 |
| D7 | 旧 ps1 处置 | 删除 | bash 版是严格超集；双份必然漂移；untracked 无历史可失 |
| D8 | 命名 | 保留 `worktree-init.sh` | 名称未完全覆盖场景 B（新克隆引导），但与旧 ps1、`ops:*` 命名同构，调用惯例与连续性优先于语义完备——刻意权衡 |

## 三、总体架构

**文件**：`scripts/ops/worktree-init.sh`，单文件、零依赖（仅 bash + git + 探测到的包管理器）。

**执行定位**：以脚本所在目录的上级为工作区根（`$(dirname "$0")/../..`）——worktree 内即 worktree 根，主仓库内即仓库根；不依赖 cwd，不使用任何绝对路径。

**模式判定**：

```
.git 是目录 → 主仓库模式（新克隆引导）
.git 是文件 → linked worktree 模式（检出后初始化）
```

**五步链（两模式共享骨架）**：

| 步骤 | worktree 模式 | 主仓库模式 |
|---|---|---|
| ① 定位与校验 | 经 `git rev-parse --git-common-dir` 反推主仓库路径 | 主仓库 = 自身 |
| ② 技术栈探测 | 读 worktree 自身根标志文件（检出的是其分支内容；主仓库工作区可能停在不同分支，不可作为探测源） | 读当前根标志文件 |
| ③ 环境版本校验 | 按 ② 结果读 engines 校验（无则跳过） | 同左 |
| ④ 依赖安装 | 探测到的包管理器执行 install | 同左；非 Node 栈只打印指引退出 0 |
| ⑤ 机器级文件同步 + 钩子兜底 | 从主仓库复制 env 类文件 + 钩子兜底 | `.env` 缺失且有 `.env.example` 时自动生成 + 钩子兜底 |

## 四、技术栈探测与包管理器优先级

探测对象一律为**当前工作区自身根**（worktree 模式 = worktree 检出内容，主仓库模式 = 仓库根）。主仓库在 worktree 模式下仅承担两个角色：`--git-common-dir` 反推定位 + env 类文件同步来源，不参与技术栈探测。

### Node 项目（深度路径）

判定条件：根存在 `package.json`。包管理器三级优先级：

| 优先级 | 依据 | 说明 |
|---|---|---|
| 1 | `packageManager` 字段 | corepack 官方约定；解析管理器名与期望版本，与本机不符仅告警不阻断 |
| 2 | lockfile 类型 | `pnpm-lock.yaml`→pnpm / `package-lock.json`→npm / `yarn.lock`→yarn / `bun.lockb`·`bun.lock`→bun |
| 3 | 兜底 | 有 `package.json` 无 `packageManager` 无任何 lockfile → 报错退出（禁止猜测后产生错误 lock 文件） |

多 lockfile 并存：以优先级 1 为准；无 `packageManager` 时告警并按固定顺序（pnpm > yarn > npm > bun）取第一个，提示提交 `packageManager` 消除歧义。

### engines 校验

- 用 `node -p` 读取 `engines.node` 与 `engines.<管理器名>`；node 缺失则提前报错（无 node 本就装不了依赖，消息明确指引安装）；
- **版本比较 = 提取范围下限 + 数字元组比较**：从 `>=24`、`^20.1`、`20.11.0` 等常见写法提取最小版本号，与本机版本做 major.minor.patch 数值比较；
- 复杂范围（`||`、`-` 区间、`x` 通配）降级为告警并跳过该项校验，不阻断（主要消费方是 subagent 无人值守场景，不存在「人工确认」）——不引入 semver 解析依赖的刻意取舍；
- 无 `engines` 字段 → 跳过校验直接安装。

### 非 Node 栈（浅路径）

| 标志文件 | 输出 |
|---|---|
| `requirements.txt` / `pyproject.toml` / `poetry.lock` | 检测到 Python，提示建 venv 与安装命令 |
| `go.mod` | 检测到 Go，提示 `go mod download` |
| `Cargo.toml` | 检测到 Rust，提示 `cargo build` |
| `pom.xml` / `build.gradle(.kts)` | 检测到 JVM，提示对应构建命令 |

完成所在模式对应的机器级文件步骤（worktree 模式：env 类同步；主仓库模式：`.env` 生成）与钩子兜底后退出码 0；多种标志并存全部列出；无任何已知标志 → 报错退出「未识别技术栈」。

## 五、两模式行为细节

### env 类文件同步（仅 worktree 模式）

三重条件交集，缺一不可：

1. 模式匹配主仓库根的 `.env`、`.env.*`、`*.local`；
2. 被主仓库 gitignore（`git -C <主仓库> check-ignore` 验证）——排除「已跟踪但本地有改动」的文件；
3. 目标 worktree 中不存在——存在即跳过并注明，绝不覆盖。

逐条打印来源与去向，结束汇总复制/跳过数量；`check-ignore` 不可用时降级为仅模式匹配并告警。实现注意：`.env.local` 同时命中 `.env.*` 与 `*.local` 两个模式，复制时需去重。

### `.env` 处理（仅主仓库模式）

- `.env` 缺失且存在 `.env.example` → 自动复制并打印醒目提示「请核对值是否需要本地修改」（新克隆无 `.env` 必然起不来，example 是官方模板，动作零风险可逆）；
- `.env` 已存在 → 跳过；两者都无 → 静默跳过。

### git 钩子兜底（两模式通用）

```
根存在 .husky/ 目录？
 ├─ 是 → core.hooksPath 已设置？→ 已设置则跳过；未设置则执行
 │       检测到的包管理器 run prepare（husky 官方幂等初始化路径）
 │       无 prepare script → 告警提示手工处理
 └─ 否 → 不做任何事（常规 .git/hooks 仓库无需干预）
```

不写死 `.husky/_` 内部目录结构——`prepare` 是 husky 文档保证的入口，版本升级不碎。

### 明确不做的事（边界声明）

- 不启动任何服务（docker / dev server）；
- 不执行 prisma migrate / seed / playwright install 等领域命令；
- 不修改任何已跟踪文件；
- 不做 git 操作（不 fetch、不切分支）——调用方负责。

## 六、错误处理与诊断输出

- `set -euo pipefail` 全程；
- 步骤追踪：每步开始打印 `==> [3/5] 环境版本校验`，成功打印 `[ok]` 摘要（沿用旧脚本视觉结构，供 subagent 读日志定位断点）；
- `trap ERR` 打印失败步骤名 + 已完成步骤清单 + 退出码；
- **退出码约定**：0 = 就绪（含非 Node 栈指引路径）；1 = 环境/版本不满足；2 = 依赖安装失败；3 = 未识别技术栈或不在 git 仓库内；
- **幂等**：重复运行安全——增量安装、已存在文件跳过、已配置钩子跳过。

## 七、Windows / WSL 约束（本机实证）

本机 `bash` = `C:\Windows\system32\bash.exe`（GNU bash 5.2.21，WSL 提供，无 Git Bash）；现有 8 个 `ops:*` 脚本全部经此路径实战过。设计约束：

1. 脚本内不得出现 Windows 盘符路径，一律相对定位；
2. **调用约定**：调用方必须自仓库根以相对路径调用（`bash scripts/ops/worktree-init.sh`，或经 `pnpm ops:worktree-init`）——WSL 下 Windows 绝对路径（`D:\...`）无法被 `dirname "$0"` 解析；
3. 不依赖 `~/.npmrc` 全局配置（WSL 的 HOME ≠ Windows 用户目录）；
4. node / pnpm 经 WSL interop 调用 Windows 可执行文件——主链路（WSL 内 `pnpm install` 到 worktree）无现成先例，列为验收首测项；
5. WSL 解析到的 `git` 实现（Windows `git.exe` 还是 WSL 自有）未实证，在 WSL cwd（`/mnt/d/...`）下 `git rev-parse --git-common-dir` 的输出路径格式是否可直接消费，不作安全声明，列入验收用例 1 实测。

## 八、验收测试（实施计划承接）

| 用例 | 方式 |
|---|---|
| 本仓库真实 worktree 全链路（本机 = WSL bash + Windows pnpm interop） | 建 `.worktrees/smoke-init` 实测：git 路径反推可用性（§7 第 5 条）/ install / .env 同步 / 钩子，随后 `git worktree remove` 清理 |
| 本仓库根模式（模拟新克隆） | `git clone` 到临时目录实测 `.env` 自动生成 |
| 无 engines / 无 package.json 仓库 | 临时目录构造最小仓库，验证跳过校验与退出码 3 |
| 非 Node 栈 | 临时目录放 `requirements.txt`，验证指引输出与退出码 0 |
| 幂等性 | 任一用例连跑两次 |

## 九、文档登记（与实施同提交，硬规则）

- `scripts/ops/worktree-init.sh` 入库；
- [build-and-verify.md](../../engineering/build-and-verify.md) ops 脚本表加行（标注双场景、零依赖、可复制到其他仓库、Windows 下经 WSL bash 执行）；
- 根 `package.json` 加 `"ops:worktree-init": "bash scripts/ops/worktree-init.sh"`（与现有 8 个 `ops:*` 同构）；
- AGENTS.md 不动（命令表指向 build-and-verify.md 全量表）。

## 背景：为什么要做这件事

2026-09-04 对 `scripts/worktree-init.ps1` 的评估结论：脚本四步逻辑与历史 6 次 worktree 会话的手工初始化步骤逐一对应，且未来「定时任务 + worktree + subagent-driven」模式下价值更大；但存在致命缺陷——**untracked 文件不随 `git worktree add` 检出，在未来的 worktree 里根本不存在**；另有 Windows 限定、零文档登记两个次要缺陷。本设计即「收编 + 通用化」的落地方案。
