# doc-lint 接入门禁链设计

- **目标**：把 doc-lint 从「依赖自觉执行」升级为「机械保障」——本地 push 前阻断 + CI 报警兜底，前置清项让基线归零。
- **来源**：backlog 开放表「doc-lint 接入门禁链」条目（2026-09-04 登记）。
- **状态**：设计已确认（2026-09-05 三问澄清：阻断式为主 / 先清项再接入 / 独立 CI job）

## 背景

`scripts/doc-lint.cjs`（母版 v1.1.0 副本）已落仓库并登记 AGENTS.md，但无机械保障——依赖文档变更后自觉执行，孤儿/死链/漂移随时可能累积。backlog 候选三方案：`pnpm check` 加步 / `ops:pre-push` 加步 / CI 报警式 job。

关键事实（已核验）：

- ④ covers 漂移基于 `git log -1 --format=%ct` 提交时间比对——开发中途任何未提交的文档改动都会即时产生告警；
- 当前基线有 2 项漂移（`backend-evolution.md` / `repo-structure.md`），接入即红；
- doc-lint 是零依赖纯 node 脚本（`child_process` + `fs`），无需安装即可执行。

## 决策与理由

| 挂载点 | 决策 | 理由 |
|---|---|---|
| `pnpm check` | ❌ 不接入 | 高频实时门禁，但漂移比对基于 git 提交时间——未提交的文档改动会产生噪声告警，违背「实时门禁零噪声」预期 |
| `ops:pre-push` | ✅ **主挂载（阻断）** | 此时改动已提交，漂移告警是真实信号；语义即「push 前 CI 同构校验」 |
| CI 独立 job | ✅ **兜底（报警）** | 防跳过 pre-push 直推；与 ADR-006「报警式不拦截」哲学一致；零依赖秒级完成 |
| husky / lint-staged | ❌ 不接入 | doc-lint 是全仓索引一致性检查（孤儿判定需跨文件比对），与「仅校验 staged 文件」作用域冲突 |

## 改动清单

### 1. 前置清项（一次性，与挂载同批提交）

| 文档 | 处理 |
|---|---|
| `docs/architecture/backend-evolution.md` | 核对内容（以代码为准）→ 同步落后内容 → 刷新 `last_verified` |
| `docs/architecture/repo-structure.md` | 同上 |

清项原则：文档与代码冲突时以代码为准并修复文档；内容仍准确则仅刷新 `last_verified`。验收：`node scripts/doc-lint.cjs .` 五检查全绿。

### 2. pre-push 挂载（`scripts/ops/pre-push.mjs`）

`check` 之后、`audit` 之前插入：

```js
// 2.5 文档一致性门禁（阻断式：孤儿/死链/frontmatter/漂移/行数预算）
run('doc-lint', 'node', ['scripts/doc-lint.cjs', '.']);
```

复用现有 `run()` 助手（失败即 `process.exit(1)`），与 check 同语义。阻断项在前、报警项（audit）收尾。

### 3. 手动执行入口（根 `package.json`）

```json
"doc:lint": "node scripts/doc-lint.cjs ."
```

登记后与 `pnpm check` 等入口并列，AGENTS.md 常用命令区可引用。

### 4. CI 报警兜底（`.github/workflows/ci.yml`）

新增独立 job（与现有六 job 并列）：

```yaml
  doc-lint:
    name: doc-lint（报警式，不红）
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 24
      - name: 文档一致性五检查
        run: node scripts/doc-lint.cjs .
        continue-on-error: true
```

无需 pnpm install（零依赖纯 node 脚本）。

### 5. 收口

| 文件 | 动作 |
|---|---|
| `docs/governance/backlog.md` | 条目移至关闭表（处置方式列写实现形态，关闭日期 2026-09-05），按既有维护规范整行移动不删行 |
| `docs/engineering/build-and-verify.md` | 常用命令区补 `pnpm doc:lint` + 刷新 `last_verified` |
| `AGENTS.md` | 常用命令区登记 `pnpm doc:lint` |

## 验证

1. **清项验收**：`node scripts/doc-lint.cjs .` 五检查全绿、退出码 0
2. **负向阻断**：制造孤儿（`docs/architecture/` 建未索引 md）→ `pnpm ops:pre-push` 阻断于 doc-lint 步 → 删除孤儿恢复
3. **正向回归**：`pnpm ops:pre-push` 全链路通过（frozen-lockfile + check + doc-lint + audit）
4. **CI 首跑**：提交后观察 doc-lint job 绿（报警式，红了也不拦截其他 job）

## 关键约束（既往治理经验）

- covers 漂移基于 git 提交时间比对——**清项文档必须与挂载改动同批提交**，否则清项后立即复现漂移；
- 提交顺序：清项与挂载同一提交内完成，确保任何中间态都不红；
- build-and-verify.md 的 covers 写 `scripts/` 是历史分工边界，本任务只刷新日期不调整 covers。
