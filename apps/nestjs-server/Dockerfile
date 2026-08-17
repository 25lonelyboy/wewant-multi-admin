# 构建必须以仓库根目录为 context：
#   docker build -f apps/nestjs-server/Dockerfile -t multi-admin-server .
FROM node:24-alpine AS build-stage

WORKDIR /repo

# pnpm 下载 tarball 的镜像（pnpm 专属变量，npm_config_* 对 pnpm 无效）
ENV PNPM_CONFIG_REGISTRY=https://registry.npmmirror.com
# corepack 下载 pnpm 本体也走镜像（corepack 专属变量）
ENV COREPACK_NPM_REGISTRY=https://registry.npmmirror.com
# prisma generate 不连库，占位值仅为满足 prisma.config.ts 加载（真实连接串由运行期 compose 注入）
ENV DATABASE_URL=postgresql://build:build@localhost:5432/build

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
# 启动链刚需：migrations/seed 源码、v7 配置、生成物（seed 经 tsx 从源码产物导入，dev/prod 同路径）
COPY --from=build-stage /repo/apps/nestjs-server/prisma ./apps/nestjs-server/prisma
COPY --from=build-stage /repo/apps/nestjs-server/prisma.config.ts ./apps/nestjs-server/prisma.config.ts
COPY --from=build-stage /repo/apps/nestjs-server/src/generated ./apps/nestjs-server/src/generated

# 启动链：migrate deploy → db seed → 主进程；任一环节失败即容器退出（compose restart 兜底）
RUN printf '#!/bin/sh\nset -e\necho "[entrypoint] migrate deploy"\npnpm exec prisma migrate deploy\necho "[entrypoint] db seed"\npnpm exec prisma db seed\necho "[entrypoint] start server"\nexec node dist/main.js\n' > /entrypoint.sh && chmod +x /entrypoint.sh

WORKDIR /repo/apps/nestjs-server
EXPOSE 3000
CMD ["/entrypoint.sh"]
