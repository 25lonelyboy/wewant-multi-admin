# 构建必须以仓库根目录为 context：
#   docker build -f apps/pure-web/Dockerfile -t multi-admin-web .
# CI 覆盖为官方源（runner 直连快，docker/build-push-action 的 build-args）：
#   PNPM_REGISTRY=https://registry.npmjs.org
#   COREPACK_NPM_REGISTRY=https://registry.npmjs.org
FROM node:24-alpine AS build-stage

WORKDIR /repo

# ---- 镜像源参数化：默认国内源（本地构建快），CI 通过 build-args 覆盖为官方源 ----
ARG PNPM_REGISTRY=https://registry.npmmirror.com
ARG COREPACK_NPM_REGISTRY=https://registry.npmmirror.com
# pnpm 下载 tarball 的镜像（pnpm 专属变量，npm_config_* 对 pnpm 无效）
ENV PNPM_CONFIG_REGISTRY=${PNPM_REGISTRY}
# corepack 下载 pnpm 本体也走镜像（corepack 专属变量）
ENV COREPACK_NPM_REGISTRY=${COREPACK_NPM_REGISTRY}

# 启用 corepack 并按 packageManager 字段锁定 pnpm 版本
# 安装 git：pnpm 11 的 onlyBuiltDependencies 注入需要
RUN corepack enable && apk add --no-cache git

# 先拷贝 manifest 与 lockfile，利用层缓存
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml .npmrc ./
COPY internal ./internal
COPY packages ./packages
COPY apps/pure-web/package.json ./apps/pure-web/

# 仅安装 pure-web 及其 workspace 依赖
RUN pnpm install --frozen-lockfile --filter @multi-admin/pure-web... \
    --registry=${PNPM_REGISTRY} \
    --fetch-timeout=180000 \
    --fetch-retries=5

COPY apps/pure-web ./apps/pure-web
# `...` 后缀 = 该包及全部依赖，pnpm 按依赖图拓扑序先构建上游（contracts），
# 与本地 turbo 任务图同源于同一份依赖声明（容器内不安装/不运行 turbo）
RUN pnpm --filter @multi-admin/pure-web... run build

FROM nginx:stable-alpine AS production-stage

COPY apps/pure-web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build-stage /repo/apps/pure-web/dist /usr/share/nginx/html
EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
