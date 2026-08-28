---
status: draft
covers:
  - apps/nestjs-server/Dockerfile
  - apps/pure-web/Dockerfile
  - docker-compose.yml
  - .github/workflows/ci.yml
last_verified: 2026-08-28
---

# 生产安全基线设计（Tier 2 #6：非 root + digest pin）

## 范围

backlog「生产安全基线加固」原三条中的剩余两条 + 一个配套件：

1. **容器非 root 运行**（原第 ① 条）
2. **镜像 digest pin**（原第 ② 条）
3. **配套件**：`check-digests` 刷新兜底脚本（digest pin 的陈旧防护，Renovate 落地前的过渡机制）

已由其他设计覆盖、不纳入本设计：第 ③ 条请求体大小（Tier 1 基建速赢，D3 已锁定 `BODY_LIMIT`/`UPLOAD_BODY_LIMIT` 双 env 可配置）。

来源：[backlog](../../governance/backlog.md)；与「server 镜像启动冒烟」维持分离顺序（耦合评估：中等编辑表面 / 弱目标依赖，冒烟作为本设计的 CI 自动化延伸紧接其后立项）。

## 已锁定决策

| # | 决策点 | 结论 | 理由 |
|---|---|---|---|
| D1 | 非 root 覆盖 | 仅 nestjs-server prod 阶段 `USER node`（UID 1000）；compose 的 server 服务补 `security_opt: [no-new-privileges:true]`；nginx 保留官方镜像不降权；postgres/redis 零动作 | node 官方镜像自带非 root 用户；nginx master-root 仅绑 80 属业界默认接受（worker 已降权）；postgres/redis 官方镜像本就非 root |
| D2 | digest 粒度 | `tag@digest` 双写（如 `node:24-alpine@sha256:...`），取 **manifest-list 层级 digest** | tag 表达版本意图、digest 锁死内容；本地 Windows + CI Linux 由 Docker 自动按平台解析 |
| D3 | digest 覆盖 | 全部 8 处：两个 Dockerfile 的 4 个 `FROM` + compose 的 postgres/redis + CI coverage job 的 service 镜像（4 个唯一镜像：node×3、nginx×1、postgres×2、redis×2） | parity 原则（CI 与生产同源）；统一规则无例外 |
| D4 | 刷新机制 | `scripts/ops/check-digests.sh` 季度人工巡检（沿用 ops 脚本薄壳模式）；Renovate 留给供应链加固主题 | digest 陈旧必须显性兜底；Renovate 与 PR 门禁组合立项（另两条目配对），届时本脚本退役 |
| D5 | CI 验证 | 不新增 CI 验证逻辑（docker-build job 照旧）；coverage 服务的镜像 digest 属 pin 范畴（变更矩阵 #4） | 验证全本地：`ops:smoke` 已覆盖最终镜像的 entrypoint 链 |

## 变更矩阵

| # | 文件 | 变更 |
|---|---|---|
| 1 | `apps/nestjs-server/Dockerfile` | 两处 `FROM node:24-alpine` 加 digest；production-stage 末尾（CMD 之前）加 `USER node`；清理 RUN 尾部追加 `mkdir -p /tmp && chmod 1777 /tmp`（重建被删除的可写临时目录）；依赖安装 RUN 内并 `chown -R node:node /repo/node_modules`（Prisma migrate/seed 引擎落盘可写；并入安装 RUN 避免独立 chown 层对 node_modules 整层 copy-up ~200MB）；增 `COPY --from=build-stage /repo/packages ./packages`（dist 裸名 import contracts 的解析来源）；增 `ENV PNPM_CONFIG_VERIFY_DEPS_BEFORE_RUN=false`（pnpm exec 依赖检查在 /repo 建临时文件的 EACCES 兜底） |
| 2 | `apps/pure-web/Dockerfile` | `FROM node:24-alpine`、`FROM nginx:stable-alpine` 加 digest（不涉及 USER） |
| 3 | `docker-compose.yml` | postgres/redis 镜像加 digest；server 服务加 `security_opt: [no-new-privileges:true]` |
| 4 | `.github/workflows/ci.yml` | coverage job 的 postgres/redis service 镜像加 digest |
| 5 | `scripts/ops/check-digests.sh`（新增）+ 根 `package.json` 注册 `ops:check-digests` | digest 漂移巡检（见下） |
| 6 | 文档同步 | `docs/engineering/build-and-verify.md` 的 ops 脚本集表格补登记（scripts/ops 无 README，该表格是唯一登记面）；同文件补非 root / digest / 刷新约定；backlog「生产安全基线加固」条目在实施完成后追加关闭标注 |

## 1. 容器非 root 化

### 现状

nestjs-server `production-stage` 以 root 运行 entrypoint 链（migrate deploy → db seed → node dist/main.js）；pure-web 的 nginx 官方镜像 master 进程以 root 运行（绑 80）；postgres/redis 官方镜像本身已以 postgres（UID 70）/redis（UID 999）用户运行。

### 设计

- nestjs-server production-stage 在 `WORKDIR` 与 `CMD` 之间加 `USER node`：
  - 后续构建指令（若有）与运行时进程均以 UID 1000 运行
  - 不改为 build-stage（依赖安装需要 root）
  - 不做 `--chown`（COPY 阶段保持 root 属主不变）；node_modules 单独归 node 属主——`chown -R node:node /repo/node_modules` 并入依赖安装 RUN 同层执行（独立 RUN 会对 node_modules 整层 copy-up ~200MB）
  - chown 属主让渡范围 = 全量 node_modules（未收窄至 @prisma/engines 路径：该路径含 Prisma 版本目录段 `@prisma+engines@{version}`，升级即失效、维护脆弱）；运行期 node 进程理论可改写依赖文件，已由 no-new-privileges + 镜像层内容不可变（构建期产物）缓解，权衡记录于此；Prisma CLI 的 migrate/seed 会向 @prisma/engines 写入引擎二进制，实测 root 属主下 node 用户启动即重启循环；运行时查询引擎为 TS/WASM 内嵌无此诉求，但 CLI 期涉及
  - `COPY --from=build-stage /repo/packages ./packages`：dist 以裸包名 import `@multi-admin/contracts`（exception-resolver 等），pnpm 链接指向 /repo/packages/contracts，缺该目录则 ERR_MODULE_NOT_FOUND（真实链路实测）
  - `ENV PNPM_CONFIG_VERIFY_DEPS_BEFORE_RUN=false`：pnpm exec 前置依赖检查会按全 workspace 判定生产裁剪安装缺失，自动 install 在 /repo 根（root 属主）建临时文件，node 用户写入 EACCES 重启循环；显式关闭（见安全分析）
  - 清理 RUN 尾部加 `mkdir -p /tmp && chmod 1777 /tmp`：现清理命令删除了 /tmp 目录本身，重建标准可写临时目录（同层无体积成本）
- compose 的 server 服务加 `security_opt: [no-new-privileges:true]`（纵深防御；不支持该选项的平台上 Docker 静默跳过）
- nginx 不降权，设计文档记录触发条件：未来迁至 K8s restricted PSA 或 OpenShift 时，web 容器换 `nginxinc/nginx-unprivileged` 变体（听 8080）并同步改 compose 端口映射与 nginx.conf

### USER node 安全分析（逐项排除运行时障碍）

| 关注点 | 结论 |
|---|---|
| entrypoint 链文件写 | node_modules 需归 node 属主（chown 并入依赖安装 RUN 同层执行）：Prisma CLI 的 migrate/seed 会向 @prisma/engines 写入引擎二进制，实测 root 属主下 node 用户启动即重启循环；属主让渡覆盖全量 node_modules——未收窄至 engines 路径（含 Prisma 版本目录段、升级脆弱），运行期 node 进程理论可改写依赖，已由 no-new-privileges + 镜像层内容不可变（构建期产物）缓解，权衡记录于此；运行时查询引擎为 TS/WASM 内嵌无此诉求，但 CLI 期涉及 |
| 端口 | 3000 > 1024，非 root 可绑定 |
| 临时目录 | prod 阶段清理命令 `rm -rf ... /tmp` 删除了 /tmp 目录本身；entrypoint 链无 /tmp 依赖（现行 root 冒烟即证）；实施时同步重建 1777 可写 /tmp 作防御性配套（见变更矩阵 #1） |
| HOME | 官方镜像预置 `/home/node`（node 用户所有）可写；pnpm exec 仅解析 node_modules/.bin，无 store 写入；`PNPM_CONFIG_VERIFY_DEPS_BEFORE_RUN=false` 关闭依赖状态预检（否则在全 workspace 判定下降权后于 /repo 根自动 install、node 用户 EACCES） |
| 文件可读性 | RUN/COPY 产物默认 root 所有 644/755，其他用户可读可执行 |
| compose healthcheck | `node -e "fetch(...)"` 随容器 USER 以 node 身份运行，正常 |

### 测试

本设计不改应用代码，无单测；验证靠「验收 1」的 `docker run --rm --entrypoint id` 断言 uid=1000 与「验收 2」全栈冒烟。

## 2. 镜像 digest pin

### 设计

8 处统一 `tag@digest` 形态，manifest-list 层级 digest：

| 位置 | 镜像 |
|---|---|
| `apps/nestjs-server/Dockerfile` build-stage | `node:24-alpine@sha256:...` |
| `apps/nestjs-server/Dockerfile` production-stage | `node:24-alpine@sha256:...` |
| `apps/pure-web/Dockerfile` build-stage | `node:24-alpine@sha256:...` |
| `apps/pure-web/Dockerfile` production-stage | `nginx:stable-alpine@sha256:...` |
| `docker-compose.yml` | `postgres:15-alpine@sha256:...`、`redis:7-alpine@sha256:...` |
| `.github/workflows/ci.yml` coverage services | `postgres:15-alpine@sha256:...`、`redis:7-alpine@sha256:...` |

### digest 获取方式（实施时执行）

```bash
docker buildx imagetools inspect node:24-alpine | head -20
# 取输出的顶层 Digest: sha256:...（manifest-list 层级），非各平台条目下的 digest
```

**陷阱**：误取平台级 digest 会在另一个架构上拉取失败。同一镜像在上述 8 处（node 出现 3 次、postgres 2 次、redis 2 次、nginx 1 次）的值必须各自一致。

### pin 注释约定

每个 pin 附带注释：`# pin: YYYY-MM-DD (pnpm ops:check-digests quarterly)`。Dockerfile 用 FROM 上方的独立整行注释（行尾注释在 Dockerfile 语法中非法，实测 `dockerfile parse error: FROM requires either one or three arguments`）；YAML（compose / ci.yml）用行尾注释，prettier 会规整为单空格。保持与现有 Dockerfile 注释同密度。

### 影响面

- 升级基础镜像从此变为显性提交（符合本仓「刻意 pin、不擅自浮动」哲学）
- 陈旧风险由检查脚本兜底（见下）；Renovate 落地后由 bot 接管

## 3. check-digests 刷新兜底脚本

### 设计

`scripts/ops/check-digests.sh`（bash，对齐现有 ops 脚本风格）：

1. 扫描 4 个源文件（两个 Dockerfile + docker-compose.yml + `.github/workflows/ci.yml`）
2. 提取所有 `tag@sha256:<digest>` pin（`FROM x@sha256:y` 与 `image: x@sha256:y` 两种形态）
3. 对每个唯一镜像执行 `docker buildx imagetools inspect <tag>`，取当前 manifest-list digest
4. 比对：一致通过；漂移输出清单（文件、当前 pin、最新 digest），exit 非零
5. 全绿 exit 0，并提示下次巡检时间

### 注册

- 根 `package.json` 增加 `"ops:check-digests": "bash scripts/ops/check-digests.sh"`（对齐既有 `ops:*` 别名）
- `docs/engineering/build-and-verify.md` 的「ops 自动化脚本集」表格补一行

### 退役条件

供应链加固主题落地 Renovate（`:pinDigests` preset）后退役本脚本。

## 验收（全本地验证，CI 不新增逻辑）

1. `docker build -f apps/nestjs-server/Dockerfile -t multi-admin-server .` 与 `docker build -f apps/pure-web/Dockerfile -t multi-admin-web .` 成功；`docker run --rm --entrypoint id multi-admin-server` 输出 uid=1000
2. `docker compose up -d --wait --build` 全栈起停验证：`docker compose exec -T server id` 输出 uid=1000(node)；容器日志含 entrypoint 三段（migrate deploy → db seed → start server）；`/health` 返回 200（注：`ops:env-up` 为宿主机 migrate/seed、`ops:smoke --server` 仅构建不运行，均不覆盖容器内 entrypoint 链，故验收改用 compose 真实链路）
3. `pnpm ops:check-digests` 全绿
4. `pnpm check` 不受影响（本设计不改应用代码）

## 风险与注意

- **digest 陈旧**：check-digests 季度巡检兜底；若巡检持续跳过，等同积累未修复的镜像漏洞（与「供应链加固」条目联动）
- **平台迁移触发**：restricted PSA / OpenShift 下 nginx 需换 unprivileged 变体（已记录）
- **manifest-list 陷阱**：获取/更新 digest 必须取顶层 manifest-list digest
- **uncommitted 变更冲突**：实施前须工作区干净（本设计文档先入库）

## 后续衔接

「server 镜像启动冒烟」作为下一个独立设计紧接本主题实施完成后立项。衔接点：冒烟在 docker-build job 新增的 postgres/redis service 镜像采用 pin 形态，check-digests 扫描 ci.yml 全文件，新 pin 自动纳入巡检。

## 提交序列

1. `docs(server): 生产安全基线设计文档`（本文件 + tasks README 索引）
2. `feat(server): Dockerfile 非 root 运行与镜像 digest pin`（变更矩阵 #1~#4 + 文档同步）
3. `feat(repo): check-digests 镜像 digest 巡检脚本`（变更矩阵 #5）

提交 2 跨 server/web/repo 文件，scope 最终拆分（`feat(server)` + `feat(repo)` 或统一 `repo`）留待实施计划细化。

每步完成后按验收清单验证。