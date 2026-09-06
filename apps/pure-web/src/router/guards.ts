import Cookies from 'js-cookie';
import { isUrl, openLink, isAllEmpty, storageLocal } from '@pureadmin/utils';
import { useMultiTagsStoreHook } from '@/store/modules/multiTags';
import { usePermissionStoreHook } from '@/store/modules/permission';
import { isOneOfArray, initRouter, getTopMenu, findRouteByPath } from './utils';
import {
  type DataInfo,
  userKey,
  removeToken,
  multipleTabsKey
} from '@/utils/auth';

/** 路由白名单 */
const whiteList = ['/login'];

/** 已登录时判断是否应留在当前页或重定向 */
function toCorrectRoute(to: ToRouteType, from: ToRouteType) {
  return whiteList.includes(to.fullPath) ? from.fullPath : undefined;
}

/**
 * 纯访问控制守卫 —— 从 router/index.ts beforeEach 抽离的决策逻辑。
 *
 * 返回值语义（与 vue-router NavigationReturn 对齐）：
 *  - `undefined`            → 放行，继续导航
 *  - `true`                 → 显式放行
 *  - `false`                → 阻断导航（外链场景）
 *  - `{ path: string }`     → 重定向
 *  - `string`               → 重定向到 from.fullPath
 */
export function permissionGuard(
  to: ToRouteType,
  from: ToRouteType,
  ctx: { router: { push: (location: string) => unknown } }
): false | { path: string } | true | string | undefined {
  const userInfo = storageLocal().getItem<DataInfo<number>>(userKey);
  const externalLink = isUrl(to?.name as string);

  if (Cookies.get(multipleTabsKey) && userInfo) {
    // ── 已登录 ──

    // 无权限跳转 403 页面（使用 isOneOfArray 做多角色交叉匹配）
    if (
      to.meta?.roles &&
      !isOneOfArray(to.meta?.roles, userInfo?.roles ?? [])
    ) {
      return { path: '/error/403' };
    }

    // 开启隐藏首页后在浏览器地址栏手动输入首页 welcome 路由则跳转到 404 页面
    if (
      import.meta.env.VITE_HIDE_HOME === 'true' &&
      to.fullPath === '/welcome'
    ) {
      return { path: '/error/404' };
    }

    if (from?.name) {
      // name 为超链接
      if (externalLink) {
        openLink(to?.name as string);
        return false;
      } else {
        return toCorrectRoute(to, from);
      }
    } else {
      // 刷新
      if (
        usePermissionStoreHook().wholeMenus.length === 0 &&
        to.path !== '/login'
      ) {
        initRouter().then((router: any) => {
          if (!useMultiTagsStoreHook().getMultiTagsCache) {
            const { path } = to;
            const route = findRouteByPath(
              path,
              router.options.routes[0].children ?? []
            );
            getTopMenu(true);
            // query、params 模式路由传参数的标签页不在此处处理
            if (route && route.meta?.title) {
              // buildHierarchyTree 运行时赋值 parentId，类型侧由 types/router.d.ts 模块增强覆盖
              if (isAllEmpty(route.parentId) && route.meta?.backstage) {
                // 此处为动态顶级路由（目录）
                const { path, name, meta } = route.children![0];
                useMultiTagsStoreHook().handleTags('push', {
                  path,
                  name,
                  meta
                });
              } else {
                const { path, name, meta } = route;
                useMultiTagsStoreHook().handleTags('push', {
                  path,
                  name,
                  meta
                });
              }
            }
          }
          // 确保动态路由完全加入路由列表并且不影响静态路由
          if (isAllEmpty(to.name)) ctx.router.push(to.fullPath);
        });
      }
      return toCorrectRoute(to, from);
    }
  } else {
    // ── 未登录 ──
    if (to.path !== '/login') {
      if (whiteList.indexOf(to.path) !== -1) {
        return true;
      } else {
        removeToken();
        return { path: '/login' };
      }
    } else {
      return true;
    }
  }
}
