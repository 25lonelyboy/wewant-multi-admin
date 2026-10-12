# 构建必须以仓库根目录为 context：
#   docker build -f apps/iot-worker/Dockerfile -t multi-admin-iot-worker .
# CI 覆盖为官方源（runner 直连快）：
#   PNPM_REGISTRY=https://registry.npmjs.org
#   COREPACK_NPM_REGISTRY=https://registry.npmjs.org
# pin: 2026-10-10 (pnpm ops:check-digests quarterly)
FROM node:24-alpine@sha256:e67514e5d0f6c46656005e1b693b2ec9d52e80b641307de684d4a015ba7a4eaf AS build-stage

WORKDIR /repo

# ---- 镜像源参数化：默认国内源（本地构建快），CI 通过 build-args 覆盖为官方源 ----
ARG PNPM_REGISTRY=https://registry.npmmirror.com
ARG COREPACK_NPM_REGISTRY=https://registry.npmmirror.com
# pnpm 下载 tarball 的镜像（pnpm 专属变量，npm_config_* 对 pnpm 无效）
ENV PNPM_CONFIG_REGISTRY=${PNPM_REGISTRY}
# corepack 下载 pnpm 本体也走镜像（corepack 专属变量）
ENV COREPACK_NPM_REGISTRY=${COREPACK_NPM_REGISTRY}

# 启用 corepack 并按 packageManager 字段锁定 pnpm 版本；安装 git：pnpm 11 的 onlyBuiltDependencies 注入需要
RUN corepack enable && apk add --no-cache git

# 先拷贝 manifest 与 lockfile，利用层缓存
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml .npmrc ./
COPY internal ./internal
COPY packages ./packages
COPY apps/iot-worker/package.json ./apps/iot-worker/

# 仅安装 iot-worker 及其 workspace 依赖
RUN pnpm install --frozen-lockfile --filter @multi-admin/iot-worker... \
    --registry=${PNPM_REGISTRY} \
    --fetch-timeout=180000 \
    --fetch-retries=5

COPY apps/iot-worker ./apps/iot-worker
# `...` 后缀 = 该包及全部依赖，pnpm 按依赖图拓扑序先构建上游（contracts / device-registry），
# 与本地 turbo 任务图同源于同一份依赖声明（容器内不安装/不运行 turbo）
RUN pnpm --filter @multi-admin/iot-worker... run build

# pin: 2026-10-10 (pnpm ops:check-digests quarterly)
FROM node:24-alpine@sha256:e67514e5d0f6c46656005e1b693b2ec9d52e80b641307de684d4a015ba7a4eaf AS production-stage

WORKDIR /repo

ENV NODE_ENV=production
# ---- 镜像源参数化（与 build-stage 独立作用域，需重新声明） ----
ARG PNPM_REGISTRY=https://registry.npmmirror.com
ARG COREPACK_NPM_REGISTRY=https://registry.npmmirror.com
ENV PNPM_CONFIG_REGISTRY=${PNPM_REGISTRY}
ENV COREPACK_NPM_REGISTRY=${COREPACK_NPM_REGISTRY}
# 生产镜像按 --filter 裁剪安装会让 pnpm exec 误判缺依赖并触发自动 install（EACCES 重启循环）
ENV PNPM_CONFIG_VERIFY_DEPS_BEFORE_RUN=false

COPY --from=build-stage /repo/package.json /repo/pnpm-workspace.yaml /repo/pnpm-lock.yaml /repo/.npmrc ./
COPY --from=build-stage /repo/internal ./internal
COPY --from=build-stage /repo/apps/iot-worker/package.json ./apps/iot-worker/

# 生产运行期只需要 dependencies，并关闭 lifecycle scripts，避免根 package 的 prepare/husky 触发
RUN corepack enable && pnpm install --frozen-lockfile --prod --ignore-scripts --filter @multi-admin/iot-worker \
    --registry=${PNPM_REGISTRY} \
    --fetch-timeout=180000 \
    --fetch-retries=5 \
    && rm -rf /root/.cache /root/.local/share/pnpm/store /tmp && mkdir -p /tmp && chmod 1777 /tmp \
    && chown -R node:node /repo/node_modules

COPY --from=build-stage /repo/apps/iot-worker/dist ./apps/iot-worker/dist
# contracts / device-registry 的产物：以裸包名 import，pnpm 链接指向 /repo/packages，缺则 ERR_MODULE_NOT_FOUND
COPY --from=build-stage /repo/packages ./packages

WORKDIR /repo/apps/iot-worker
USER node

# ⚠️ 无 migrate / seed：本进程不碰 PG。启动即消费，任一环节失败容器退出（compose restart 兜底）
CMD ["node", "dist/index.js"]
