# Turborepo 构建编排全量迁移设计

> 任务域：`2026-08-23-turbo-build-orchestration`。目标：以 Turborepo 取代 npm pre hook 编排，全仓四端 + 共享包统一纳管；干净仓库下开发、构建、类型检查、lint、测试、镜像构建全链路通畅且入口统一。关联治理：[governance/backlog.md](../../governance/backlog.md)；决策将落档为 ADR-005。

## 1. 目标与范围

**总目标**：本次调整之后，全仓统一纳管于单一任务图；干净仓库（克隆后仅 `pnpm install`）下四端所有命令（dev / build / typecheck / lint / test / 镜像构建）链路完整，无任何“靠恰好构建过”的隐性前提。

**纳入范围（四合一立项）**：

1. 构建编排迁移：引入 `turbo`，建任务图，删光全部 pre 钩子，根入口统一切换；
2. harness 审查 finding 落点一：各端 `lint` 脚本去 `--fix`，门禁恢复纯校验语义（同步修订 AGENTS.md 表述）；
3. harness 审查 finding 落点二：`check` 增加 test 覆盖显式枚举，消除静默跳过；
4. stylelint 纳入任务图与门禁（2026-08-23 基线实测双端全绿，见 §3 决策 13）。

**不在范围**：preload 安全不变量自动验证（另行立项）；CI/CD 引入（既定约束）；uni-mobile 微信平台以外的平台支持；Docker 容器内引入编排器。

## 2. 现状问题与证据

### 2.1 pre hook 模式的结构性失效

| 消费方 | 入口 | 现状 | 判定 |
| --- | --- | --- | --- |
| 根 | `pnpm -r run build` | pnpm 拓扑序 | ✅ |
| pure-web | `pretypecheck` | contracts 构建 | ✅ |
| pure-web | `build` | 无前置 | ❌ 缺口 |
| nestjs-server | `pretypecheck` / `pretest` | generate + contracts | ✅ |
| nestjs-server | `build` | 脚本内嵌 generate，无 contracts | ❌ 缺口 |
| **nestjs-server** | **`dev`** | **无任何前置（`src/generated` 不入库，已实证被 gitignore）** | **❌ 现存断链（一直靠残留产物掩盖）** |
| electron-desktop | `prebuild` / `prebuild:dir` | 仅 pure-web，无 contracts | ❌ backlog 已登记 |

结构性原因：`--filter` 单包入口不携带上游；跨任务依赖（typecheck/test → 上游 build 产物）无法由 pnpm 推导；只能按"消费方 × 入口变体"手写钩子，组合爆炸且已有变体陷阱事故（`prebuild` 不匹配 `build:dir`）。

### 2.2 Docker 构建链已断（新发现）

两个 Dockerfile 均在容器内用 `pnpm --filter X run build`（单包入口），不会先构建 contracts ⇒ P5 完成后 nestjs-server 镜像构建必然失败。

### 2.3 脚本膨胀

- uni-mobile：dev 17 条 + build 17 条，其中 30 条为低频平台变体或重复别名；
- nestjs-server：`test:debug` 为脚手架死代码（`ts-node/register` 与现行 `--experimental-vm-modules` ESM 模式不兼容）；`test:cov` 是 `test:coverage` 串联链的真子集；
- pure-web：`serve`（dev 别名）、`preview:build`（低价值组合）。

### 2.4 门禁语义缺陷（harness 审查 findings）

- 四端 lint 脚本带 `--fix` ⇒ `pnpm check` 静默改写工作区，与 AGENTS.md「ESLint 只校验」声明矛盾；
- `check.mjs` 的 test 阶段 `--if-present` 静默跳过，无覆盖可见性；
- stylelint 在 pure-web / uni-mobile 已有配置与脚本，但游离于门禁与编排之外（基线实测全绿，处置见决策 13）。

## 3. 已锁定决策（澄清阶段产出）

| # | 决策点 | 结论 | 被否方案及理由 |
| --- | --- | --- | --- |
| 1 | 任务范围 | 三合一（编排迁移 + lint 纯校验 + test 可见性） | 纯编排迁移（check 门禁链路二次返工）；全量含 preload 验证（正交能力，另行立项） |
| 2 | 迁移策略 | 一次性迁移，按 scope 分 commit | 按任务类型分批（无双体系并存期；无 CI 金丝雀，分批只拉长风险） |
| 3 | 图粒度 | 全仓统一纳管：主图任务 + 桌面端/后端变体 + uni 微信与 h5 主入口；其余变体不入图 | 仅主图四任务（变体陷阱复发）；全量入图（重度任务误触发风险，复杂度不值） |
| 4 | Docker 构建链 | 模式三：`--filter X...` pnpm 原生拓扑，容器内不引入 turbo | 容器内上 turbo（无缓存复用价值，安装面扩大 + husky prepare 干扰）；不修（断链已是事实） |
| 5 | 双链正当性 | 可接受：两条链的拓扑均从同一份 package.json 依赖声明自动推导、执行同一批脚本，顺序不会分叉；接 CI 后自然收敛为单链 | 手工双拓扑（企业级红线，会漂移） |
| 6 | dev 任务 | 入图（`persistent: true, cache: false, dependsOn: ["^build"]`），修复干净仓库直接起 dev 的隐性断链 | dev 不入图（干净仓库起开发仍裸奔，"统一纳管"不闭环） |
| 7 | uni-mobile 精简 | 仅保留 h5（默认）+ mp-weixin，删 30 条变体/别名（含 `dev:custom` / `build:custom` / `dev:h5:ssr` / `build:h5:ssr`：`createSSRApp` 仅为 uni-app Vue3 模板标准入口，非 SSR 使用证据，SSR 与自定义平台无实际使用场景，YAGNI） | 保留全平台（无业务需求，纯膨胀）；仅删小程序变体保留 ssr/custom（无使用证据的脚本继续占维护面） |
| 8 | nestjs 精简 | 删 `test:debug`（死代码）、`test:cov`（子集） | 保留（语义重复 + 死代码维护成本） |
| 9 | prisma generate | 包内前置，嵌入 nestjs 的 dev / typecheck / test / test:watch / test:e2e / test:coverage 脚本原子；不做图节点 | 图节点化（容器内裸跑脚本会失去前置，违反原子自洽原则） |
| 10 | electron-builder | `build` / `build:dir` 任务 `cache: false` | 启用缓存（历史文件锁问题 + 安装包大产物，收益负） |
| 11 | contracts 补 lint/format | 纳入（backlog 触发条件"消费者 ≥2"已满足：nestjs + pure-web） | 不补（触发条件已成立，拖延即治理失效） |
| 12 | check.mjs 去留 | 保留为门禁编排器，内部改调 `turbo run`，新增 test 覆盖枚举阶段，为未来 preload 验证阶段预留插入位 | 删除改纯 npm script（失去阶段化输出与扩展位） |
| 13 | stylelint 入门禁 | 纳入：2026-08-23 基线实测（真实首跑）pure-web / uni-mobile 双双退出码 0、零违规；纳入成本仅 4 处声明式改动；`stylelint:fix` 变体不入图不入门禁（修复型不进校验门，与 format 同哲学），提交期修复由 lint-staged 既有 `stylelint --fix` 覆盖 | 不纳入登记 backlog（原决策前提“需先基线审计”，审计结果全绿后前提不成立）；纳入但豁免 warnings（门禁形同虚设） |

## 4. 编排模型

### 4.1 四条总原则（写入 AGENTS.md）

1. **原子自洽管包内前置**：包内工具生成物（如 `prisma generate`）嵌入该包脚本原子，保证任何环境（含 Docker 容器）裸跑脚本自洽；
2. **图管跨包顺序**：跨 workspace 依赖（contracts → 消费方）一律由 `turbo.json` 的 `dependsOn: ["^build"]` 从依赖声明推导，脚本内禁止再出现 `pnpm --filter ... run build` 式编排；
3. **入口纪律**：所有编排入口走 `turbo run <task> [--filter=X]`（根脚本已封装）；裸 `pnpm --filter X run <script>` 为非入口专家操作，不保证链路；
4. **容器同构兜底**：Docker 内用 `pnpm --filter X... run build` 复用同一依赖图拓扑，与本地编排顺序一致。

### 4.2 `turbo.json` 设计（根目录）

```jsonc
{
  "$schema": "https://turbo.build/schema.json",
  "tasks": {
    // 批处理任务
    "build":           { "dependsOn": ["^build"], "outputs": ["dist/**", "dist-electron/**"] },
    "build:staging":   { "dependsOn": ["^build"], "outputs": ["dist/**"] },
    "build:dir":       { "dependsOn": ["^build"], "cache": false },
    "build:mp-weixin": { "dependsOn": ["^build"], "outputs": ["dist/**"] },
    "typecheck":       { "dependsOn": ["^build"] },
    "lint":            {},
    "stylelint":       {},
    "test":            { "dependsOn": ["^build"], "cache": false },
    "test:e2e":        { "dependsOn": ["^build"], "cache": false },
    "test:coverage":   { "dependsOn": ["^build"], "cache": false },
    // 常驻任务
    "dev":           { "persistent": true, "cache": false, "dependsOn": ["^build"] },
    "dev:mp-weixin": { "persistent": true, "cache": false, "dependsOn": ["^build"] },
    "test:watch":    { "persistent": true, "cache": false, "dependsOn": ["^build"] },
    // 包级覆写（与全局定义合并，未声明键继承）
    "//apps/nestjs-server#build":       { "outputs": ["dist/**", "src/generated/**"] },
    "//apps/electron-desktop#build":    { "cache": false },
    "//apps/electron-desktop#typecheck": { "dependsOn": [] },
    "//apps/electron-desktop#dev":      { "dependsOn": [] }
  }
}
```

关键建模说明：

- **electron → pure-web 是打包时依赖，不是编译时依赖**：仅 `build` / `build:dir`（需将 pure-web dist 打进安装包）走 `^build`；`typecheck` / `dev` 覆写为空依赖，避免触发整分钟级无谓的 vite build；
- `dev` 的 `^build` 保证干净仓库起开发前 contracts 已构建（毫秒级缓存命中），修复 §2.1 的 dev 断链；
- `build` 任务全局 `cache: true`，electron 覆写关闭；`lint` 无 outputs，仅缓存退出状态。

### 4.3 根入口映射

| 入口 | 现状 | 迁移后 |
| --- | --- | --- |
| `dev` | `pnpm -r --parallel run dev` | `turbo run dev` |
| `dev:server` | `pnpm --filter @multi-admin/nestjs-server run dev` | `turbo run dev --filter=@multi-admin/nestjs-server` |
| `dev:web` | 同上（pure-web） | `turbo run dev --filter=@multi-admin/pure-web` |
| `dev:mobile` | `pnpm --filter @multi-admin/uni-mobile run dev:h5` | `turbo run dev --filter=@multi-admin/uni-mobile` |
| `dev:desktop` | 同上（electron） | `turbo run dev --filter=@multi-admin/electron-desktop` |
| `build` | `pnpm -r run build` | `turbo run build` |
| `build:web` / `build:desktop` | `pnpm --filter X run build` | `turbo run build --filter=X` |
| `check` | `node ./scripts/check.mjs` | 不变（check.mjs 内部重写，见 §4.6） |
| `lint` | `pnpm -r run lint` | `turbo run lint` |
| `typecheck` | `pnpm -r run typecheck` | `turbo run typecheck` |
| `format` / `format:check` / `clean:cache` / `prepare` | — | 不变 |
| `test:e2e` / `test:coverage`（专家入口，新增说明） | 包内直调 | `turbo run test:e2e --filter=@multi-admin/nestjs-server` 等 |

### 4.4 各端脚本变更

**nestjs-server**

| 动作 | 脚本 |
| --- | --- |
| 删除 | `pretypecheck`、`pretest`、`test:debug`、`test:cov` |
| 变更（前置嵌入） | `dev` → `prisma generate && nest start --watch`；`typecheck` → `prisma generate && tsc --noEmit`；`test` → `prisma generate && node --experimental-vm-modules node_modules/jest/bin/jest.js`；`test:watch` 同式嵌入；`test:e2e` → `prisma generate && node --experimental-vm-modules node_modules/jest/bin/jest.js --config ./test/jest-e2e.cjs` |
| 变更（链重构） | `test:coverage` → `prisma generate && node --experimental-vm-modules node_modules/jest/bin/jest.js --coverage && prisma generate && node --experimental-vm-modules node_modules/jest/bin/jest.js --config ./test/jest-e2e.cjs --coverage && node test/merge-coverage.cjs`（原链引用的 `test:cov` 已删；contracts 前置改由图提供；e2e 环节需先 `docker compose up` 起库，此环境前置写入 `docs/engineering/build-and-verify.md`） |
| 变更（去 --fix） | `lint` → `eslint . --cache --max-warnings 0` |
| 不变 | `build`（已内嵌 generate）、`start*`、`prisma:*` |

**pure-web**

| 动作 | 脚本 |
| --- | --- |
| 删除 | `serve`、`preview:build`、`pretypecheck` |
| 变更（去 --fix） | `lint` → `eslint --cache --max-warnings 0 src mock build` |
| 变更（入门禁） | `stylelint` 补 `--max-warnings 0`（基线零警告，安全）；`stylelint:fix` 不变且不入门禁 |
| 不变 | `dev` / `build` / `build:staging` / `report` / `preview` / `typecheck` / `format` / `stylelint:fix` / `svgo` |

**uni-mobile**

| 动作 | 脚本 |
| --- | --- |
| 删除（30 条） | 全部非微信平台变体与重复别名：`dev:custom` / `dev:h5` / `dev:h5:ssr` / 9 个非微信 `dev:mp-*` / 3 个 `dev:quickapp-*`；`build:h5` / `build:custom` / `build:h5:ssr` / 9 个非微信 `build:mp-*` / 3 个 `build:quickapp-*` |
| 保留 | `dev`（默认 h5）、`dev:mp-weixin`、`build`（默认 h5）、`build:mp-weixin`、`typecheck` |
| 变更（去 --fix） | `lint` → `eslint "{src,test}/**/*.{ts,vue}"` |
| 变更（入门禁） | `stylelint` 补 `--max-warnings 0`（基线零警告，安全） |

**electron-desktop**

| 动作 | 脚本 |
| --- | --- |
| 删除 | `prebuild`、`prebuild:dir` |
| 变更（去 --fix） | `lint` → `eslint --cache --max-warnings 0 electron` |
| 不变 | `dev`（dev.mjs 内部编排原样）、`build`、`build:dir`、`typecheck` 等 |

**packages/contracts**（backlog 触发条件成立，补齐门禁脚本）

| 动作 | 内容 |
| --- | --- |
| 新增文件 | `eslint.config.mjs` 薄壳（引用 `@multi-admin/eslint-config` 工厂） |
| 新增脚本 | `lint`: `eslint src --cache --max-warnings 0`；`format`: `prettier --check .` |
| 新增依赖 | `eslint`、`prettier`（catalog；后者为 `format` 脚本提供包内二进制）、`@multi-admin/eslint-config`（workspace） |

**packages/common**：不动（无消费者，补齐触发条件未到）。

### 4.5 Docker 构建链修复（模式三）

两个 Dockerfile 各改一行 + 注释说明：

```dockerfile
# `...` 后缀：该包及全部依赖，pnpm 按依赖图拓扑序先构建上游（如 contracts）
RUN pnpm --filter @multi-admin/nestjs-server... run build
```

容器内不安装、不运行 turbo；原子自洽（prisma generate 内嵌）保证脚本裸跑完整。

### 4.6 `scripts/check.mjs` 重写

保留脚本作为门禁编排器，阶段结构：

1. `prettier --check .`（纯校验，不变）；
2. `turbo run typecheck`；
3. `turbo run lint`（图内任务已无 --fix，保证前后 `git status` 无差异）；
4. `turbo run stylelint`（新阶段；脚本本无 --fix，天然满足纯校验语义）；
5. `turbo run test`；
6. **test 覆盖枚举（新阶段）**：遍历 workspace 清单，逐包报告「有 test / 无 test（跳过）」，消除静默跳过；
7. 为未来 preload 不变量验证阶段预留插入位（注释标注）。

## 5. 重难点与解法

| # | 重难点 | 解法 |
| --- | --- | --- |
| 1 | 缓存正确性（历史"陈旧产物"陷阱的等价物） | `outputs` 精确声明（含 nestjs `src/generated/**`）；验收 #4 专项验证缓存不返陈旧 |
| 2 | electron → pure-web 依赖的语义建模 | 打包时依赖仅挂 `build` / `build:dir`；`typecheck` / `dev` 包级覆写空依赖（§4.2） |
| 3 | 删钩子后 nestjs 包内前置真空 | 「原子自洽」原则：generate 嵌入全部相关脚本原子（决策 #9） |
| 4 | 门禁语义恢复 | lint 去 `--fix` + check 阶段化 + 覆盖枚举；lint-staged 保留提交期 `--fix`（两处职责划分写入 AGENTS.md） |
| 5 | electron-builder 锁史 | `cache: false` + 干净环境完整出安装包验证 |
| 6 | 双编排源心智成本 | 原则 4 + AGENTS.md 声明；两链同源于依赖声明，接 CI 后收敛 |

## 6. 风险清单

| 风险 | 可能性 | 影响 | 缓解 | 验证 |
| --- | --- | --- | --- | --- |
| `outputs` 错配致缓存返回陈旧产物 | 中 | 高 | 精确声明 + 专项验证 | 验收 #4 |
| electron 打包锁 / 产物异常 | 中 | 高 | `cache: false` | 验收 #3 干净环境出安装包 |
| 钩子残留导致双体系 | 中 | 中 | 删净 + grep 零残留 | 验收 #8 |
| 去 `--fix` 后 fixable 违规浮出致门禁转红 | 中 | 中 | 实施顺序约束：先带 `--fix` 全量清理并提交，再去 `--fix`（§8） | 验收 #6 |
| Docker 本机不可用无法验证 | 中 | 中 | 改动仅各 1 行；不可验证则登记 backlog，下次部署首验 | 验收 #9（可降级） |
| turbo 与 pnpm 11 / Node 24 兼容问题 | 低 | 高 | 第一步安装 + 空跑冒烟，失败即止损（未动任何脚本） | 实施步骤 1 |
| 未来升级 stylelint 规则集致门禁转红 | 低 | 低 | 进化约束：规则集变更先跑基线再入门禁（当前基线双端全绿） | 日常进化约束，无一次性验证 |

## 7. 影响面

**新增**：`turbo.json`、`packages/contracts/eslint.config.mjs`、`docs/decisions/ADR-005-*`。

**修改**：根 `package.json`（入口 + devDep `turbo: catalog:`）、`pnpm-workspace.yaml`（catalog +turbo pinned）、`pnpm-lock.yaml`、`scripts/check.mjs`（重写）、4 个 app + `packages/contracts` 的 `package.json`、2 个 Dockerfile（各 1 行）、`.gitignore`（+`.turbo`）、`AGENTS.md`、`docs/engineering/build-and-verify.md`、`docs/architecture/repo-structure.md` / `contracts.md` / `desktop-app.md`（重写其中 prebuild / pretypecheck 钩子编排的表述为任务图模型）、`docs/decisions/README.md`（追加 ADR-005 索引行 + 改写 ADR-003 决策列）、`docs/governance/backlog.md`（关闭 electron 断链行与 contracts lint/format 行）。

**明确不动**：husky 钩子、`.lintstagedrc.json`、commitlint、catalog 既有治理、`dev.mjs` 内部逻辑、preload 安全边界、uni-mobile 微信平台以外的功能。

## 8. 实施顺序约束（计划阶段必须遵守）

1. turbo 安装 + 冒烟为独立第一步，失败即止损；
2. **去 `--fix` 前**：先跑一次带 `--fix` 的全量 lint 并格式化收尾，提交清理结果；否则移除 `--fix` 后既有 fixable 违规会以报错形式浮出，门禁转红；
3. 删钩子与图切换必须同一提交内原子完成，不允许"半图半钩子"中间态入库；
4. `test:coverage` 链重构与 `test:cov` 删除同一提交（链引用关系）；
5. 文档（AGENTS.md / build-and-verify / ADR-005 / backlog 关闭）与对应代码变更同一提交（docs-in-same-commit 硬规则）。

## 9. 验收标准（黄金路径）

1. 冒烟：`pnpm install` 后 `turbo run build` 成功；
2. 干净工作区（清除全部产物目录）`turbo run build` 全绿，拓扑顺序正确（contracts → pure-web → electron）；
3. 干净工作区 `pnpm build:desktop` 不断链并产出安装包（关闭 backlog 断链项）；
4. 二次 `turbo run build` 全缓存命中；修改 contracts 源码一行 → 下游 typecheck / build 重跑（不返陈旧）；
5. 干净工作区 `pnpm dev` / `dev:server` / `dev:web` / `dev:mobile` 均可正常启动（contracts dist 由图前置）；`dev:desktop` 交互式验证（dev.mjs 启动链）；
6. `pnpm check` 前后 `git status` 无差异（门禁纯校验化）；
7. `pnpm check` 输出含每包 test 覆盖枚举与 stylelint 阶段，全绿收口；
8. 全仓检索 `pretypecheck|pretest|prebuild` 零残留；
9. 两个镜像 `docker build` 成功（环境不可用时降级：登记 backlog + 下次部署首验）；
10. `pnpm build:web` / `build:staging` / uni `build:mp-weixin` 单入口在干净工作区均不断链。

## 10. 提交与文档计划

| 序 | scope | 内容 |
| --- | --- | --- |
| 1 | `repo` | turbo 引入（catalog + 安装 + `turbo.json` + `.gitignore`）+ 冒烟 |
| 2 | `repo` | lint 收尾清理（带 `--fix` 最后一跑 + 格式化提交） |
| 3 | `repo` | 编排迁移原子提交：根入口切换、删全部 pre 钩子、各端脚本改造与精简、check.mjs 重写 |
| 4 | `repo` | Docker 拓扑修复（2 文件） |
| 5 | `docs` | ADR-005（构建编排选型 + 双链模式决策）、AGENTS.md、build-and-verify、backlog 关闭 |

ADR-005 要点：turbo vs pre hook vs pnpm 原生拓扑 vs Nx 四方案对比、双链模式正当性论证、`原子自洽 + 图编排 + 入口纪律 + 容器同构兜底`四原则；**与 ADR-003 的关系声明**：ADR-003 正文不改（历史快照，不可变规则），其工具链精确 pin 决策继续有效，「构建编排放桌面端 prebuild 钩子」部分由 ADR-005 取代；因仅部分取代，不将 ADR-003 整体标记 `superseded`（frontmatter 不合法值且语义失真），取代信息承载于 `docs/decisions/README.md` 索引行的决策列改写与 ADR-005 的关系声明。

收尾同步：迁移验收后，同步更新记载旧编排模式的文档与代理记忆（含 `docs/decisions/README.md` 索引补充、prebuild 钩子实践类记忆的修订），防止旧模式表述误导后续任务。
