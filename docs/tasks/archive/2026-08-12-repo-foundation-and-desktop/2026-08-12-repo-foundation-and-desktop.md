# 阶段一：仓库级基架修复 + Harness 基线 + 桌面端（Electron）接入 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复仓库级基架硬伤（env 契约、Dockerfile、compose），建立仓库级 harness（`pnpm check` 入口 + AGENTS.md + 决策记录 + README），并搭建 `apps/desktop` Electron 桌面端脚手架（消费 pure-web 产物，含托盘常驻骨架）。

**Architecture:** 三个递进部分——①仓库级基架修复（不依赖任何业务选型的地基）；②仓库级 harness（单人无 CI 场景下，本地一条命令全量校验 + 仓库内显式约定文档，作为 AI 编程的验收与上下文基线）；③Electron 桌面端以"主进程 TS 源码 + tsx 直跑"的最小形态接入，dev 加载 pure-web dev server，打包链留给阶段二。

**Tech Stack:** pnpm workspace + catalog、Node 24、Electron（pinned）+ tsx + electron-builder（仅配置）、Docker（node:24-alpine / nginx / postgres:16-alpine）+ docker compose。

**仓库既有约定（执行者必读）：**
- 提交规范：commitlint 强制 scope，可用值 `server/mobile/web/desktop/common/internal/repo/deps/release`，格式如 `feat(desktop): xxx`。
- 格式化：Prettier 独占格式化（单引号、无尾逗号、箭头单参省括号），ESLint/Stylelint 只校验。
- 依赖判据：≥2 消费者 / 框架工具链级 / 刻意 pin 的依赖入 catalog，其余留 app 本地；pin 的包在 catalog 中保持 pin。
- ESLint 薄壳模式：app 内 eslint 配置只消费 `@multi-admin/eslint-config` 工厂函数，差异显式声明并注释理由。
- 换行符：Prettier `endOfLine: 'auto'`，Windows 环境保持 CRLF 不强制改写。

---

## Part A：仓库级基架修复

### Task 1: env 契约建立与 .gitignore 矛盾消解

**背景：** `.gitignore` 中 `.env*` 规则与已提交的 `apps/pure-web/.env*` 冲突；全仓库无 `.env.example`；pure-web 的 mock（vite-plugin-fake-server）目前无条件启用且 `enableProd: true`，前后端联调时无法关闭。

**Files:**
- Create: `apps/pure-web/.env.example`
- Create: `.env.example`（根，compose 服务变量模板）
- Modify: `apps/pure-web/.env.development`
- Modify: `apps/pure-web/build/plugins.ts:17-20,47-53`
- Modify: `apps/pure-web/vite.config.ts:13-14,33`
- Modify: `.gitignore:29-31`

- [ ] **Step 1: 创建 pure-web env 模板**

创建 `apps/pure-web/.env.example`：

```ini
# 平台本地运行端口号
VITE_PORT = 8848

# 是否隐藏首页 隐藏 true 不隐藏 false
VITE_HIDE_HOME = false

# 开发环境读取配置文件路径
VITE_PUBLIC_PATH = /

# 路由历史模式（Hash 传 "hash"、HTML5 传 "h5"）
VITE_ROUTER_HISTORY = "hash"

# 是否启用本地 mock（vite-plugin-fake-server）；接入真实后端后置为 false
VITE_MOCK = true

# 后端 API 基址（联调真实后端时填写，如 http://localhost:3000）
VITE_API_BASE =
```

- [ ] **Step 2: 创建根 compose env 模板**

创建根目录 `.env.example`：

```ini
# docker compose 服务变量（复制为 .env 后填写）
POSTGRES_PASSWORD=change-me

# NestJS 数据库连接（compose 服务内使用服务名 postgres 作为 host）
DATABASE_URL=postgresql://postgres:change-me@postgres:5432/multi_admin?schema=public
```

- [ ] **Step 3: 开发 env 默认开启 mock**

在 `apps/pure-web/.env.development` 末尾追加：

```ini

# 是否启用本地 mock（联调真实后端时改为 false）
VITE_MOCK = true
```

- [ ] **Step 4: 修改 plugins.ts 支持 VITE_MOCK 开关**

修改 `apps/pure-web/build/plugins.ts`：

将函数签名改为：

```typescript
export async function getPluginsList(
  VITE_CDN: boolean,
  VITE_COMPRESSION: ViteCompression,
  VITE_MOCK: boolean
): Promise<PluginOption[]> {
```

将 mock 插件注册改为：

```typescript
    // mock支持（由 VITE_MOCK 控制，联调真实后端时关闭）
    VITE_MOCK
      ? vitePluginFakeServer({
          logger: false,
          include: 'mock',
          infixName: false,
          enableProd: true
        })
      : null,
```

- [ ] **Step 5: vite.config.ts 透传 VITE_MOCK**

修改 `apps/pure-web/vite.config.ts`：

```typescript
  const { VITE_CDN, VITE_PORT, VITE_COMPRESSION, VITE_PUBLIC_PATH, VITE_MOCK } =
    wrapperEnv(loadEnv(mode, root));
```

（注意 `wrapperEnv` 已将 `'true'/'false'` 字符串转布尔，`VITE_CDN` 即此机制。）

```typescript
    plugins: await getPluginsList(VITE_CDN, VITE_COMPRESSION, VITE_MOCK),
```

- [ ] **Step 6: 消解 .gitignore 矛盾**

将 `.gitignore` 中：

```
# dotenv environment variable files
.env*
!.env.example
```

替换为：

```
# dotenv：模板/平台配置入库；机器级敏感覆盖走 *.local（上方 *.local 规则已覆盖）
*.env.local
```

说明：pure-web 的 `.env/.env.development/.env.production/.env.staging` 为纯平台配置（无敏感信息），按现状入库；机器级敏感覆盖使用 `.env.local`（已被上方 `*.local` 规则忽略）。

- [ ] **Step 7: 验证 dev 启动且 mock 正常**

Run: `pnpm dev:web`

Expected: 浏览器打开 `http://localhost:8848`，登录页可用 mock 账号登录成功（admin/admin123，pure-admin 默认）。

再临时将 `.env.development` 中 `VITE_MOCK` 改为 `false` 重启，Expected: 登录请求 404（mock 已关闭），验证开关生效。验证后改回 `true`。

- [ ] **Step 8: 提交**

```bash
git add apps/pure-web/.env.example .env.example apps/pure-web/.env.development apps/pure-web/build/plugins.ts apps/pure-web/vite.config.ts .gitignore
git commit -m "feat(repo): 建立 env 契约与 mock 开关，消解 gitignore 矛盾"
```

---

### Task 2: `pnpm check` 聚合校验脚本

**背景：** 无 CI 场景下需要一条命令完成全量校验（typecheck + lint + prettier check + test），既是人工提交前自检，也是后续 AI agent 的验收标准。lint-staged 只做增量，不能替代全量。

**Files:**
- Create: `scripts/check.mjs`
- Modify: `package.json:6-18`（scripts 段）

- [ ] **Step 1: 编写校验脚本**

创建 `scripts/check.mjs`：

```javascript
// 仓库级全量校验入口（无 CI 场景的本地质量门禁）。
// 按序执行：Prettier 全量格式检查 → 各 workspace 的 typecheck / lint / test（脚本存在才执行）。
// 任一阶段失败立即退出并以非零码返回。
import { spawnSync } from 'node:child_process';

const isWin = process.platform === 'win32';

/** 以继承 stdio 的方式执行命令，失败即终止 */
function run(name, cmd, args) {
  console.log(`\n\u25b6 ${name}`);
  const result = spawnSync(cmd, args, {
    stdio: 'inherit',
    shell: isWin,
    env: process.env
  });
  if (result.status !== 0) {
    console.error(`\n\u2716 失败于：${name}`);
    process.exit(result.status ?? 1);
  }
}

run('prettier 格式检查', 'pnpm', ['exec', 'prettier', '--check', '.']);
run('typecheck', 'pnpm', ['-r', 'run', 'typecheck']);
run('lint', 'pnpm', ['-r', 'run', 'lint']);
run('test', 'pnpm', ['-r', '--if-present', 'run', 'test']);

console.log('\n\u2714 全量校验通过');
```

- [ ] **Step 2: 注册根脚本**

在 `package.json` 的 `scripts` 中，`typecheck` 之后新增一行：

```json
    "check": "node ./scripts/check.mjs",
```

- [ ] **Step 3: 运行验证**

Run: `pnpm check`

Expected: 四个阶段依次执行并全部通过，最终输出 `✔ 全量校验通过`，退出码 0。

若某阶段失败，先修复暴露的存量问题（属于本任务范围），再重跑直至通过。

- [ ] **Step 4: 提交**

```bash
git add scripts/check.mjs package.json
git commit -m "feat(repo): 新增 pnpm check 全量校验入口"
```

---

### Task 3: 重写 pure-web Dockerfile

**背景：** 现有 `apps/pure-web/Dockerfile` 三处硬伤：以子包为 context 却 COPY 根目录文件；`node:20-alpine` 违反 `engines >= 24` + `engine-strict`；`pnpm@latest` 未锁定。重写为根 context 的多阶段 workspace 构建。

**Files:**
- Overwrite: `apps/pure-web/Dockerfile`
- Create: `apps/pure-web/nginx.conf`

- [ ] **Step 1: 重写 Dockerfile**

用以下内容整体替换 `apps/pure-web/Dockerfile`（构建命令必须以**仓库根目录**为 context：`docker build -f apps/pure-web/Dockerfile .`）：

```dockerfile
# 构建必须以仓库根目录为 context：
#   docker build -f apps/pure-web/Dockerfile -t multi-admin-web .

FROM node:24-alpine AS build-stage

WORKDIR /repo

# 启用 corepack 并按 packageManager 字段锁定 pnpm 版本
RUN corepack enable

# 安装 git：pnpm 11 的 onlyBuiltDependencies 注入需要
RUN apk add --no-cache git

# 先拷贝 manifest 与 lockfile，利用层缓存
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml .npmrc ./
COPY internal ./internal
COPY packages ./packages
COPY apps/pure-web/package.json ./apps/pure-web/

# 仅安装 pure-web 及其 workspace 依赖
RUN pnpm install --frozen-lockfile --filter @multi-admin/pure-web...

COPY apps/pure-web ./apps/pure-web
RUN pnpm --filter @multi-admin/pure-web run build

FROM nginx:stable-alpine AS production-stage

COPY apps/pure-web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build-stage /repo/apps/pure-web/dist /usr/share/nginx/html

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
```

- [ ] **Step 2: 创建 nginx 配置**

创建 `apps/pure-web/nginx.conf`：

```nginx
server {
    listen 80;
    server_name localhost;

    root /usr/share/nginx/html;
    index index.html;

    # 静态资源长缓存（产物文件名带 hash）
    location /assets/ {
        expires 30d;
        add_header Cache-Control "public, immutable";
    }

    # pure-web 默认 hash 路由，单页入口兜底即可；若切换 history 模式同样适用
    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

- [ ] **Step 3: 本地构建验证**

在仓库根目录执行：

Run: `docker build -f apps/pure-web/Dockerfile -t multi-admin-web .`

Expected: 构建成功，无 engine-strict 报错、无 COPY 找不到文件报错。

Run: `docker run --rm -p 8080:80 multi-admin-web`

Expected: 浏览器访问 `http://localhost:8080` 可见登录页。

- [ ] **Step 4: 提交**

```bash
git add apps/pure-web/Dockerfile apps/pure-web/nginx.conf
git commit -m "fix(web): 重写 Dockerfile 为根 context 多阶段构建并修正 node 版本"
```

---

### Task 4: nestjs-server Dockerfile 与 docker-compose 骨架

**背景：** 部署方案为 docker compose 本机部署（web + server + postgres）。server 当前是脚手架，Dockerfile 按现状可运行即可，Prisma/DB 接入在阶段二再增强。

**Files:**
- Create: `apps/nestjs-server/Dockerfile`
- Create: `docker-compose.yml`

- [ ] **Step 1: 创建 server Dockerfile**

创建 `apps/nestjs-server/Dockerfile`（同样以仓库根为 context）：

```dockerfile
# 构建必须以仓库根目录为 context：
#   docker build -f apps/nestjs-server/Dockerfile -t multi-admin-server .

FROM node:24-alpine AS build-stage

WORKDIR /repo
RUN corepack enable
RUN apk add --no-cache git

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml .npmrc ./
COPY internal ./internal
COPY packages ./packages
COPY apps/nestjs-server/package.json ./apps/nestjs-server/

RUN pnpm install --frozen-lockfile --filter @multi-admin/nestjs-server...

COPY apps/nestjs-server ./apps/nestjs-server
RUN pnpm --filter @multi-admin/nestjs-server run build

FROM node:24-alpine AS production-stage

WORKDIR /repo
ENV NODE_ENV=production

COPY --from=build-stage /repo/package.json /repo/pnpm-workspace.yaml /repo/pnpm-lock.yaml /repo/.npmrc ./
COPY --from=build-stage /repo/internal ./internal
COPY --from=build-stage /repo/apps/nestjs-server/package.json ./apps/nestjs-server/

# 生产运行期只需要 dependencies
RUN corepack enable && pnpm install --frozen-lockfile --prod --filter @multi-admin/nestjs-server

COPY --from=build-stage /repo/apps/nestjs-server/dist ./apps/nestjs-server/dist

WORKDIR /repo/apps/nestjs-server
EXPOSE 3000
CMD ["node", "dist/main.js"]
```

- [ ] **Step 2: 创建 docker-compose.yml**

创建根目录 `docker-compose.yml`：

```yaml
# 本机部署编排：web（nginx）+ server（NestJS）+ postgres
# 启动前复制根目录 .env.example 为 .env 并填写密码
services:
  postgres:
    image: postgres:16-alpine
    restart: unless-stopped
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:?请在 .env 中设置 POSTGRES_PASSWORD}
      POSTGRES_DB: multi_admin
    volumes:
      - postgres-data:/var/lib/postgresql/data
    healthcheck:
      test: ['CMD-SHELL', 'pg_isready -U postgres -d multi_admin']
      interval: 5s
      timeout: 5s
      retries: 10

  server:
    build:
      context: .
      dockerfile: apps/nestjs-server/Dockerfile
    restart: unless-stopped
    environment:
      NODE_ENV: production
      PORT: 3000
      # 阶段二接入 Prisma 后生效
      DATABASE_URL: ${DATABASE_URL:-postgresql://postgres:${POSTGRES_PASSWORD}@postgres:5432/multi_admin?schema=public}
    ports:
      - '3000:3000'
    depends_on:
      postgres:
        condition: service_healthy

  web:
    build:
      context: .
      dockerfile: apps/pure-web/Dockerfile
    restart: unless-stopped
    ports:
      - '8080:80'

volumes:
  postgres-data:
```

- [ ] **Step 3: 验证 compose 启动**

在根目录复制 env 并启动：

Run（cmd）: `copy .env.example .env`

Run: `docker compose up --build -d`

Expected: 三个服务均 healthy/running；`http://localhost:8080` 可见登录页；`http://localhost:3000` 返回 NestJS 默认 `Hello World!`。

Run: `docker compose down`（验证后停止，保留数据卷）

- [ ] **Step 4: 提交**

```bash
git add apps/nestjs-server/Dockerfile docker-compose.yml
git commit -m "feat(repo): 新增 server Dockerfile 与 compose 部署骨架"
```

---

## Part B：仓库级 Harness 基线

> Harness 定义（本项目）：无 CI 场景下，让"人 + AI agent"都能用统一入口验证仓库状态、并从仓库内文档获得完整上下文的一套设施：`pnpm check`（Task 2）+ 决策记录（Task 5）+ AGENTS.md（Task 6）+ README（Task 7）。各端 harness（测试、各端校验）在阶段二逐端补充。

### Task 5: 决策记录沉淀（docs/decisions）

**背景：** catalog 判据、lint 职责分离、jest pin、桌面端选型等决策目前只存在于 git history，AI 与新会话需要反复"考古"。沉淀为仓库内 ADR（轻量：一个决策一个文件）。

**Files:**
- Create: `docs/decisions/README.md`
- Create: `docs/decisions/0001-dependency-catalog-criteria.md`
- Create: `docs/decisions/0002-lint-prettier-separation.md`
- Create: `docs/decisions/0003-jest-version-pin.md`
- Create: `docs/decisions/0004-desktop-framework-electron.md`

- [ ] **Step 1: 创建决策目录说明**

创建 `docs/decisions/README.md`：

```markdown
# 工程决策记录（ADR）

一决策一文件，编号递增。新增决策复制下方模板；决策被推翻时不删除原文件，在文末追加"后续"段落指向新决策。

## 模板

- **日期 / 状态**：YYYY-MM-DD / 已采纳（或已废弃）
- **背景**：问题与约束
- **结论**：选了什么
- **理由**：为什么（含权衡）
- **拒绝的备选**：为什么不选
- **失效条件**：什么情况下需要重新评估

## 目录

| 编号 | 主题 |
| --- | --- |
| 0001 | 依赖 catalog 收入判据与 A/B/C/D 分类 |
| 0002 | ESLint/Stylelint 与 Prettier 职责分离 |
| 0003 | jest 30.4.1 版本 pin |
| 0004 | 桌面端框架选型 Electron |
```

- [ ] **Step 2: 创建 ADR-0001 依赖 catalog 判据**

创建 `docs/decisions/0001-dependency-catalog-criteria.md`：

```markdown
# 0001 依赖 catalog 收入判据与 A/B/C/D 分类

- **日期 / 状态**：2026-08 / 已采纳
- **背景**：多端 monorepo 中同一依赖多版本并存（曾出现 3 个 TS、2 个 Vite），需统一版本治理策略。
- **结论**：pnpm-workspace.yaml catalog 只收满足任一判据的依赖：①≥2 个 workspace 包消费（或明确即将共享）；②框架/工具链级依赖（版本漂移直接引发运行错误）；③被刻意固定版本（无 ^）的依赖。其余留在 app 本地。版本大不兼容时用 named catalog（如 uni-app 的 Vite 5.2.8）而非强行统一。
- **理由**：目标是"消除多消费者版本分歧"而非 100% 覆盖；全覆盖会增加改一版动两文件的维护成本，单消费者无一致性收益。
- **拒绝的备选**：全部入 catalog（维护成本高）；搬入根 package.json 靠 hoisting 共享（幻影依赖）。
- **分类方法**：A 类立即收入（框架核心）；B 类随工具链收敛收入；C 类先收敛到共享包再入 catalog；D 类保留 app 本地（单消费者/跟随模板升级/pin 有局部上下文）。
- **失效条件**：项目退化为单应用，或某依赖变为全跨消费者时重新评估范围。
```

- [ ] **Step 3: 创建 ADR-0002 lint 职责分离**

创建 `docs/decisions/0002-lint-prettier-separation.md`：

```markdown
# 0002 ESLint/Stylelint 与 Prettier 职责分离

- **日期 / 状态**：2026-08 / 已采纳
- **背景**：pure-admin 模板自带 eslint-plugin-prettier 等格式化集成，与仓库基线存在规则分歧。
- **结论**：ESLint/Stylelint 只负责代码质量校验（移除 *-prettier 插件，保留 eslint-config-prettier 关冲突规则）；格式化由 Prettier 独占，通过 lint-staged（增量）+ `pnpm check` 中 prettier --check（全量）拦截。
- **理由**：避免双通道格式规则冲突；单一职责便于各端薄壳接入 internal/* 基线。
- **拒绝的备选**：eslint-plugin-prettier 一体化（规则冲突难维护，性能差）。
- **失效条件**：若引入 Biome 等统一工具链可重新评估。
```

- [ ] **Step 4: 创建 ADR-0003 jest pin 理由**

创建 `docs/decisions/0003-jest-version-pin.md`：

```markdown
# 0003 jest 30.4.1 版本 pin

- **日期 / 状态**：2026-08 / 已采纳
- **背景**：jest 族包（jest-runtime/jest-circus/jest-mock/expect/jest-snapshot）在依赖树中可能被传递依赖拉到不一致版本，导致运行期错误。
- **结论**：catalog 中 jest 固定为 30.4.1（无 ^），并通过 pnpm overrides 强制全依赖树一致。
- **理由**：jest 子包版本必须严格对齐，半解析不一致会产生难以排查的运行时错误；pin 的理由按 0001 判据③要求在此可见化。
- **失效条件**：jest 升级时同步更新 catalog 与 overrides，并确认传递依赖对齐后重评是否可改回 caret 范围。
```

- [ ] **Step 5: 创建 ADR-0004 桌面端选型**

创建 `docs/decisions/0004-desktop-framework-electron.md`：

```markdown
# 0004 桌面端框架选型：Electron

- **日期 / 状态**：2026-08 / 已采纳
- **背景**：桌面端需求：托盘常驻、开机自启、本地文件读写、打印机操作（含静默打印）；目标平台暂定 Windows；单人开发 + TS 技能树 + AI 辅助编程。
- **结论**：选 Electron。工程形态为 apps/desktop 消费 pure-web 产物（dev 接 vite dev server，prod 加载 dist）。
- **理由**：决定性因素是打印：Electron 有 webContents.print() 静默打印与 getPrintersAsync 枚举，生态成熟；全链路 TS 保证 AI 产出可被开发者完整审查。体积劣势（80~150MB）在本机部署场景不敏感。
- **拒绝的备选**：Tauri v2（体积小但无一方打印支持，深度原生交互需 Rust，偏离技能树）。
- **失效条件**：放弃静默打印需求、需覆盖 macOS/Linux 或对体积敏感时重评。electron/electron-builder 版本 pin 在 catalog，二进制下载配 npmmirror 镜像。
```

- [ ] **Step 6: 提交**

```bash
git add docs/decisions
git commit -m "docs(repo): 沉淀工程决策记录 ADR 0001-0004"
```

---

### Task 6: AGENTS.md（AI 协作契约）

**背景：** Vibe Coding 模式下 AI agent 的第一入口文档：仓库结构、命令、硬约定、验收入口。保持精简，深层细节链向 docs/decisions。

**Files:**
- Create: `AGENTS.md`

- [ ] **Step 1: 创建 AGENTS.md**

创建根目录 `AGENTS.md`：

```markdown
# AGENTS.md — 仓库协作契约

面向人类与 AI agent 的仓库使用说明书。改代码前先读这里；验收用 `pnpm check`。

## 仓库结构

| 路径 | 职责 |
| --- | --- |
| `apps/nestjs-server` | NestJS v11 后端（Node ESM） |
| `apps/pure-web` | Vue3 + pure-admin Web 管理端 |
| `apps/uni-mobile` | uni-app 移动端（微信小程序/H5/App） |
| `apps/desktop` | Electron 桌面端，消费 pure-web 产物 |
| `packages/common` | 跨端共享包（类型/常量/纯工具，禁用 DOM/Node API） |
| `internal/*` | 工具链共享配置：eslint-config / stylelint-config / tsconfig |

## 常用命令

| 命令 | 用途 |
| --- | --- |
| `pnpm install` | 安装（engine-strict：Node>=24 / pnpm>=11） |
| `pnpm dev:server` / `dev:web` / `dev:mobile` / `dev:desktop` | 分端启动 |
| `pnpm build` | 全量构建 |
| `pnpm check` | 全量校验（prettier --check + typecheck + lint + test），提交前必跑 |
| `pnpm format` | Prettier 全量格式化 |
| `docker compose up --build -d` | 本机部署（web:8080 / server:3000 / postgres） |

## 硬约定

1. **提交**：commitlint 强制 scope（server/mobile/web/desktop/common/internal/repo/deps/release），如 `feat(web): xxx`；Merge 提交豁免。
2. **格式化**：Prettier 独占（单引号、无尾逗号、箭头单参省括号）；ESLint/Stylelint 只管质量。
3. **依赖**：新增依赖先查 `docs/decisions/0001-dependency-catalog-criteria.md` 判据，多消费者/框架级/刻意 pin 的用 `catalog:` 引用。
4. **lint 配置**：各端 eslint/stylelint 为薄壳，只消费 `internal/*` 基线工厂函数；放宽规则必须注释理由。
5. **环境**：机器级敏感配置只进 `.env.local`（已忽略）；平台配置模板见各处 `.env.example`。
6. **验收**：任何变更完成后运行 `pnpm check` 全绿才算完成。

## 决策与背景

工程决策见 `docs/decisions/`（catalog 判据、lint 分离、jest pin、桌面端选型）。

## 当前阶段

阶段一：仓库基架 + 桌面端接入；阶段二起逐端完善认证/日志/测试/部署与各端 harness。路线详见 README。
```

- [ ] **Step 2: 提交**

```bash
git add AGENTS.md
git commit -m "docs(repo): 新增 AGENTS.md 仓库协作契约"
```

---

### Task 7: 根 README

**Files:**
- Create: `README.md`

- [ ] **Step 1: 创建根 README**

创建根目录 `README.md`（注意：README 内含代码块，此处用四反引号围栏展示，实际文件内仍是三反引号）：

````markdown
# multi-admin

多端管理系统 monorepo：NestJS 后端 + pure-admin Web 端 + uni-app 移动端 + Electron 桌面端。

## 环境要求

- Node.js >= 24（见 .nvmrc）
- pnpm >= 11（已由 packageManager 锁定）
- Docker Desktop（本机部署时需要）

## 快速开始

```bash
pnpm install
pnpm dev:server   # 后端 http://localhost:3000
pnpm dev:web      # Web 端 http://localhost:8848
pnpm dev:mobile   # 移动端 H5
pnpm dev:desktop  # 桌面端（依赖 pure-web dev server）
```

提交前运行 `pnpm check`（prettier --check + typecheck + lint + test）。

## 仓库结构

见 [AGENTS.md](../../../../AGENTS.md)。

## 部署

```bash
copy .env.example .env   # 填写 POSTGRES_PASSWORD
docker compose up --build -d
# web: http://localhost:8080   server: http://localhost:3000
```

## 开发路线

| 阶段 | 内容 | 状态 |
| --- | --- | --- |
| 一 | 仓库基架修复 + harness 基线 + Electron 接入 | 进行中 |
| 二 | 各端基架完善（认证/日志/部署/测试）与各端 harness | 待启动 |
| 三 | packages 共享模块建设（API 类型契约从 OpenAPI 生成） | 待启动 |
| 四 | 项目级 harness 体系完善 | 待启动 |
| 五 | 业务功能模块化开发 | 待启动 |

工程决策记录见 `docs/decisions/`。
````

- [ ] **Step 2: 提交**

```bash
git add README.md
git commit -m "docs(repo): 新增根 README"
```

---

### Task 8: 移除 changesets

**背景：** 所有包 private:true 且无发布需求，changesets 无 release 流程配套，单人项目下属认知噪音，按评估结论移除（未来需要时再引入）。

**Files:**
- Delete: `.changeset/` 整个目录
- Modify: `package.json`（移除 devDependencies 中 `"@changesets/cli": "catalog:"` 一行）
- Modify: `pnpm-workspace.yaml`（移除 catalog 中 `'@changesets/cli': '^2.31.1'` 一行）

- [ ] **Step 1: 删除目录与两处引用**

删除 `.changeset/` 目录（含 config.json 与 README.md），并从上述两个文件中移除对应行。

- [ ] **Step 2: 重装并验证**

Run: `pnpm install`

Expected: lockfile 更新成功，无 changesets 相关残留。

Run: `pnpm check`

Expected: 全绿（确认移除未破坏任何脚本）。

- [ ] **Step 3: 提交**

```bash
git add -A
git commit -m "chore(repo): 移除未启用的 changesets"
```

---

## Part C：桌面端 Electron 脚手架（apps/desktop）

> 形态约定：主进程/preload 用 TS 源码，开发态通过 `NODE_OPTIONS=--import tsx` 让 Electron 直接加载 TS（免构建链）；dev 加载 pure-web 的 vite dev server；打包（electron-builder）仅预留配置，阶段二接入。托盘常驻骨架在本阶段落地，开机自启/打印/文件读写 IPC 留阶段二。

### Task 9: 版本核实、镜像配置与工程骨架

**Files:**
- Modify: `.npmrc`
- Modify: `pnpm-workspace.yaml`（catalog 段）
- Create: `apps/desktop/package.json`

- [ ] **Step 1: 查询当前稳定版本**

Run: `pnpm view electron version` 与 `pnpm view electron-builder version`、`pnpm view tsx version`

Expected: 得到三个当前最新版本号，记录备用（下文以 `<ELECTRON_VER>`、`<BUILDER_VER>`、`<TSX_VER>` 指代）。

- [ ] **Step 2: 配置 Electron 二进制镜像**

在 `.npmrc` 末尾追加：

```ini
# Electron 二进制下载镜像（国内网络）
electron_mirror=https://npmmirror.com/mirrors/electron/
electron_builder_binaries_mirror=https://npmmirror.com/mirrors/electron-builder-binaries/
```

- [ ] **Step 3: catalog 新增三个条目**

在 `pnpm-workspace.yaml` 的 `catalog:` 段按字母序插入（electron/electron-builder 刻意 pin 无 ^，符合 ADR-0001 判据③；tsx 为工具链级依赖）：

```yaml
  'electron': '<ELECTRON_VER>'
  'electron-builder': '<BUILDER_VER>'
  'tsx': '^<TSX_VER>'
```

- [ ] **Step 4: 创建 apps/desktop/package.json**

```json
{
  "name": "@multi-admin/desktop",
  "version": "0.1.0",
  "private": true,
  "description": "Electron 桌面应用，消费 pure-web 产物",
  "type": "module",
  "main": "./src/main/index.ts",
  "scripts": {
    "dev": "tsx scripts/dev.ts",
    "typecheck": "tsc --noEmit",
    "lint": "eslint . --fix"
  },
  "devDependencies": {
    "@multi-admin/eslint-config": "workspace:*",
    "@multi-admin/tsconfig": "workspace:*",
    "electron": "catalog:",
    "electron-builder": "catalog:",
    "eslint": "catalog:",
    "tsx": "catalog:",
    "typescript": "catalog:"
  },
  "engines": {
    "node": ">=24",
    "pnpm": ">=11"
  },
  "build": {
    "appId": "com.wewant.multiadmin",
    "productName": "MultiAdmin",
    "directories": {
      "output": "release"
    },
    "win": {
      "target": "nsis"
    },
    "nsis": {
      "oneClick": false,
      "allowToChangeInstallationDirectory": true
    }
  }
}
```

说明：`main` 指向 TS 源码仅供开发态（tsx 加载）；阶段二打包时改为指向编译产物。`build` 段为 electron-builder 预留配置。

- [ ] **Step 5: 安装并验证 electron 可启动**

Run: `pnpm install`

Expected: electron 二进制从 npmmirror 下载成功，无 engine 报错。

Run: `pnpm --filter @multi-admin/desktop exec electron --version`

Expected: 输出 `v<ELECTRON_VER>`。

- [ ] **Step 6: 提交**

```bash
git add .npmrc pnpm-workspace.yaml pnpm-lock.yaml apps/desktop/package.json
git commit -m "feat(desktop): 新增 Electron 工程骨架与二进制镜像配置"
```

---

### Task 10: tsconfig、ESLint 薄壳与全局类型

**Files:**
- Create: `apps/desktop/tsconfig.json`
- Create: `apps/desktop/eslint.config.mjs`
- Create: `apps/desktop/types/global.d.ts`

- [ ] **Step 1: 创建 tsconfig**

创建 `apps/desktop/tsconfig.json`：

```json
{
  "extends": "@multi-admin/tsconfig/node.json",
  "compilerOptions": {
    "sourceMap": true,
    "types": ["node"]
  },
  "include": ["src/**/*.ts", "scripts/**/*.ts", "types/**/*.d.ts"],
  "exclude": ["dist", "release"]
}
```

- [ ] **Step 2: 创建 ESLint 薄壳**

创建 `apps/desktop/eslint.config.mjs`（与 nestjs-server 同款模式）：

```javascript
// @ts-check
import { nodeConfig } from '@multi-admin/eslint-config/node';

/**
 * desktop ESLint 薄壳：零参消费仓库 Node 基线（含类型感知 TS 规则），
 * 无规则放宽，守住基线。
 */
export default [
  // 不参与 lint 的文件：构建产物、打包产物、本配置文件自身
  {
    ignores: ['dist/**', 'release/**', 'eslint.config.mjs']
  },
  // 仓库 Node 基线；tsconfigRootDir 用于类型感知规则定位本包的 tsconfig
  ...nodeConfig({ tsconfigRootDir: import.meta.dirname })
];
```

- [ ] **Step 3: 创建渲染进程全局类型**

创建 `apps/desktop/types/global.d.ts`（与 preload 暴露面一一对应，供 pure-web 后续消费）：

```typescript
export {};

declare global {
  interface Window {
    /** Electron preload 通过 contextBridge 暴露的桌面能力（随阶段扩充） */
    desktop: {
      platform: NodeJS.Platform;
      versions: { electron: string; chrome: string; node: string };
    };
  }
}
```

- [ ] **Step 4: 提交**

```bash
git add apps/desktop/tsconfig.json apps/desktop/eslint.config.mjs apps/desktop/types
git commit -m "feat(desktop): 接入 tsconfig 基线与 ESLint 薄壳"
```

---

### Task 11: 主进程、preload 与托盘常驻

**Files:**
- Create: `apps/desktop/src/main/index.ts`
- Create: `apps/desktop/src/main/tray.ts`
- Create: `apps/desktop/src/preload/index.ts`
- Create: `apps/desktop/resources/tray.png`（可选，见 Step 4）

- [ ] **Step 1: 主进程入口**

创建 `apps/desktop/src/main/index.ts`：

```typescript
import { app, BrowserWindow, shell } from 'electron';
import path from 'node:path';
import { createTray } from './tray';

let mainWindow: BrowserWindow | null = null;
let allowQuit = false;

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1366,
    height: 860,
    show: false,
    webPreferences: {
      preload: path.join(import.meta.dirname, '../preload/index.ts'),
      contextIsolation: true,
      nodeIntegration: false,
      // preload 需运行于非沙箱环境以支持 ESM/TS 加载（开发态 tsx）
      sandbox: false
    }
  });

  mainWindow.once('ready-to-show', () => mainWindow?.show());

  // 外部链接一律走系统浏览器，防止壳内导航
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: 'deny' };
  });

  const devUrl = process.env.DESKTOP_DEV_URL;
  if (devUrl) {
    void mainWindow.loadURL(devUrl);
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    // prod 产物加载路径随阶段二打包链接入
    throw new Error('prod 加载路径尚未接入（阶段二打包链）');
  }

  // 托盘常驻：关窗仅隐藏，仅托盘"退出"真退出
  mainWindow.on('close', event => {
    if (!allowQuit) {
      event.preventDefault();
      mainWindow?.hide();
    }
  });
}

void app.whenReady().then(() => {
  createWindow();
  createTray({
    onShow: () => {
      mainWindow?.show();
      mainWindow?.focus();
    },
    onQuit: () => {
      allowQuit = true;
      app.quit();
    }
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  // Windows 托盘常驻场景：不退出，仅托盘"退出"可退
});
```

- [ ] **Step 2: 托盘模块**

创建 `apps/desktop/src/main/tray.ts`：

```typescript
import { Menu, Tray, nativeImage } from 'electron';
import path from 'node:path';

export interface TrayCallbacks {
  onShow: () => void;
  onQuit: () => void;
}

let tray: Tray | null = null;

export function createTray(callbacks: TrayCallbacks): void {
  const iconPath = path.join(import.meta.dirname, '../../resources/tray.png');
  const icon = nativeImage.createFromPath(iconPath);
  // 图标缺失时降级为空图标，保证托盘功能可用
  tray = new Tray(icon.isEmpty() ? nativeImage.createEmpty() : icon);
  tray.setToolTip('MultiAdmin');
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: '显示主窗口', click: callbacks.onShow },
      { type: 'separator' },
      { label: '退出', click: callbacks.onQuit }
    ])
  );
  tray.on('double-click', callbacks.onShow);
}
```

- [ ] **Step 3: preload 暴露面**

创建 `apps/desktop/src/preload/index.ts`：

```typescript
import { contextBridge } from 'electron';

// 桌面能力暴露点：保持最小面，业务 IPC（打印/自启/文件）随阶段二扩充
contextBridge.exposeInMainWorld('desktop', {
  platform: process.platform,
  versions: {
    electron: process.versions.electron ?? '',
    chrome: process.versions.chrome ?? '',
    node: process.versions.node
  }
});
```

- [ ] **Step 4: 托盘图标（可选）**

若手边有图片工具：将 `apps/pure-web/public/logo.svg` 转为 32x32 PNG 存为 `apps/desktop/resources/tray.png`；若无工具可跳过（代码已降级处理），阶段二补。

- [ ] **Step 5: 提交**

```bash
git add apps/desktop/src apps/desktop/resources
git commit -m "feat(desktop): 主进程/preload 骨架与托盘常驻"
```

---

### Task 12: dev 启动链与根脚本

**背景：** `pnpm dev:desktop` 需先拉起 pure-web dev server，就绪后再启动 Electron；主进程 TS 通过 `NODE_OPTIONS=--import tsx` 直载。

**Files:**
- Create: `apps/desktop/scripts/dev.ts`
- Modify: `package.json`（根 scripts）
- Modify: `.gitignore`

- [ ] **Step 1: dev 启动脚本**

创建 `apps/desktop/scripts/dev.ts`：

```typescript
// 桌面端 dev 启动器：先拉起 pure-web vite dev server，端口就绪后启动 Electron。
// 主进程/preload 的 TS 源码通过 NODE_OPTIONS=--import tsx 由 Electron 直载。
import { spawn } from 'node:child_process';
import path from 'node:path';
import electron from 'electron';

const WEB_PORT = 8848;
const desktopDir = path.resolve(import.meta.dirname, '..');
const webDir = path.resolve(desktopDir, '../pure-web');
const isWin = process.platform === 'win32';

async function waitForServer(url: string, timeoutMs = 120000): Promise<void> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.status < 500) return;
    } catch {
      // 尚未就绪，继续等待
    }
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  throw new Error(`等待 ${url} 超时`);
}

const web = spawn('pnpm', ['dev'], {
  cwd: webDir,
  stdio: 'inherit',
  shell: isWin
});

try {
  await waitForServer(`http://localhost:${WEB_PORT}`);
  const nodeOptions = ['--import tsx', process.env.NODE_OPTIONS]
    .filter(Boolean)
    .join(' ');
  const app = spawn(electron as unknown as string, ['.'], {
    cwd: desktopDir,
    stdio: 'inherit',
    shell: isWin,
    env: {
      ...process.env,
      NODE_OPTIONS: nodeOptions,
      DESKTOP_DEV_URL: `http://localhost:${WEB_PORT}`
    }
  });
  app.on('exit', () => web.kill());
  web.on('exit', () => app.kill());
} catch (error) {
  web.kill();
  throw error;
}
```

- [ ] **Step 2: 根脚本与 gitignore**

在根 `package.json` scripts 中 `dev:web` 之后新增：

```json
    "dev:desktop": "pnpm --filter @multi-admin/desktop run dev",
```

在 `.gitignore` 的 compiled output 段（`**/dist` 之后）新增：

```
release
**/release
```

- [ ] **Step 3: 端到端验证**

Run: `pnpm dev:desktop`

Expected:
1. pure-web vite 在 8848 启动；
2. Electron 窗口打开并渲染 pure-admin 登录页，mock 登录可用；
3. 关闭窗口后进程不退出，系统托盘出现图标，右键菜单"显示主窗口/退出"、双击恢复窗口；"退出"后 web dev server 随之结束。

**应急预案**：若目标机器上 `NODE_OPTIONS=--import tsx` 未被 Electron 主进程接受（报模块加载错误），降级为 esbuild 预编译：在 dev.ts 中先用 `esbuild`（新增 catalog 条目）将 `src/main/index.ts`、`src/preload/index.ts` 编译到 `apps/desktop/.dev/`（format: esm），并写一个 `{"type":"module","main":"main.js"}` 的 `.dev/package.json`，改为 `electron .dev` 启动。此降级实现后同步更新本计划与 ADR-0004。

- [ ] **Step 4: 提交**

```bash
git add apps/desktop/scripts package.json .gitignore
git commit -m "feat(desktop): dev 启动链与根 dev:desktop 脚本"
```

---

### Task 13: 全量校验与收尾

- [ ] **Step 1: 全仓校验**

Run: `pnpm check`

Expected: prettier/typecheck/lint/test 全绿（此时 desktop 已纳入 typecheck 与 lint）。

- [ ] **Step 2: 核对文档一致性**

检查 `AGENTS.md`（结构表/命令表的 desktop 行）与 `README.md`（dev:desktop）与本阶段产物一致；Task 6/7 已预写 desktop 条目，此处仅确认无需改动。若 Task 12 触发应急预案，同步更新 AGENTS.md 与 ADR-0004。

- [ ] **Step 3: 收尾提交（如有文档改动）**

```bash
git add -A
git commit -m "docs(repo): 阶段一收尾，同步桌面端接入说明"
```

无改动则跳过本步。

---

## 验收清单（阶段一整体）

- [ ] `pnpm check` 全绿
- [ ] `docker compose up --build -d` 三服务正常（web:8080 / server:3000 / postgres healthy）
- [ ] `pnpm dev:desktop` 端到端可用（窗口渲染 pure-web、托盘常驻生效）
- [ ] mock 开关可切换（VITE_MOCK=false 后登录请求 404）
- [ ] AGENTS.md / README.md / docs/decisions 入库且与现状一致
- [ ] changesets 已移除，无残留引用

## 阶段二预告（不在本计划范围）

NestJS 基架（Config/Prisma/JWT/pino/Swagger）、pure-web 接入真实 API（VITE_API_BASE + proxy）、desktop 打包链与打印/自启 IPC、各端测试基建与各端 harness。
