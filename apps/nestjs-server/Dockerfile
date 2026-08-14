# 构建必须以仓库根目录为 context：
#   docker build -f apps/nestjs-server/Dockerfile -t multi-admin-server .
FROM node:24-alpine AS build-stage

WORKDIR /repo

# pnpm 下载 tarball 的镜像（pnpm 专属变量，npm_config_* 对 pnpm 无效）
ENV PNPM_CONFIG_REGISTRY=https://registry.npmmirror.com
# corepack 下载 pnpm 本体也走镜像（corepack 专属变量）
ENV COREPACK_NPM_REGISTRY=https://registry.npmmirror.com

# 启用 corepack 并按 packageManager 字段锁定 pnpm 版本
# 安装 git：pnpm 11 的 onlyBuiltDependencies 注入需要
RUN corepack enable && apk add --no-cache git

# 先拷贝 manifest 与 lockfile，利用层缓存
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml .npmrc ./
COPY internal ./internal
COPY packages ./packages
COPY apps/nestjs-server/package.json ./apps/nestjs-server/

# 仅安装 nestjs-server 及其 workspace 依赖
RUN pnpm install --frozen-lockfile --filter @multi-admin/nestjs-server... \
    --registry=https://registry.npmmirror.com \
    --fetch-timeout=180000 \
    --fetch-retries=5

COPY apps/nestjs-server ./apps/nestjs-server
RUN pnpm --filter @multi-admin/nestjs-server run build

FROM node:24-alpine AS production-stage

WORKDIR /repo

ENV NODE_ENV=production
# pnpm 下载 tarball 的镜像（pnpm 专属变量，npm_config_* 对 pnpm 无效）
ENV PNPM_CONFIG_REGISTRY=https://registry.npmmirror.com
# corepack 下载 pnpm 本体也走镜像（corepack 专属变量）
ENV COREPACK_NPM_REGISTRY=https://registry.npmmirror.com

COPY --from=build-stage /repo/package.json /repo/pnpm-workspace.yaml /repo/pnpm-lock.yaml /repo/.npmrc ./
COPY --from=build-stage /repo/internal ./internal
COPY --from=build-stage /repo/apps/nestjs-server/package.json ./apps/nestjs-server/

# 生产运行期只需要 dependencies，并且关闭 lifecycle scripts，避免根 package 的 prepare/husky 触发
RUN corepack enable && pnpm install --frozen-lockfile --prod --ignore-scripts --filter @multi-admin/nestjs-server \
    --registry=https://registry.npmmirror.com \
    --fetch-timeout=180000 \
    --fetch-retries=5

COPY --from=build-stage /repo/apps/nestjs-server/dist ./apps/nestjs-server/dist

WORKDIR /repo/apps/nestjs-server
EXPOSE 3000
CMD [ "node", "dist/main.js" ]
