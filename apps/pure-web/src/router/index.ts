import '@/utils/sso';
import { getConfig } from '@/config';
import NProgress from '@/utils/progress';
import { transformI18n } from '@/plugins/i18n';
import { buildHierarchyTree } from '@/utils/tree';
import remainingRouter from './modules/remaining';
import { usePermissionStoreHook } from '@/store/modules/permission';
import { isUrl, cloneDeep } from '@pureadmin/utils';
import {
  ascending,
  getHistoryMode,
  handleAliveRoute,
  formatTwoStageRoutes,
  formatFlatteningRoutes
} from './utils';
import { permissionGuard } from './guards';
import {
  type Router,
  type RouteRecordRaw,
  type RouteComponent,
  createRouter
} from 'vue-router';

/** 自动导入全部静态路由，无需再手动引入！匹配 src/router/modules 目录（任何嵌套级别）中具有 .ts 扩展名的所有文件，除了 remaining.ts 文件
 * 如何匹配所有文件请看：https://github.com/mrmlnc/fast-glob#basic-syntax
 * 如何排除文件请看：https://cn.vitejs.dev/guide/features.html#negative-patterns
 */
const modules: Record<string, any> = import.meta.glob(
  ['./modules/**/*.ts', '!./modules/**/remaining.ts'],
  {
    eager: true
  }
);

/** 原始静态路由（未做任何处理） */
const routes: Array<RouteRecordRaw | RouteRecordRaw[]> = [];

Object.keys(modules).forEach(key => {
  routes.push(modules[key].default);
});

/** 导出处理后的静态路由（三级及以上的路由全部拍成二级） */
export const constantRoutes: Array<RouteRecordRaw> = formatTwoStageRoutes(
  formatFlatteningRoutes(buildHierarchyTree(ascending(routes.flat(Infinity))))
);

/** 初始的静态路由，用于退出登录时重置路由 */
const initConstantRoutes: Array<RouteRecordRaw> = cloneDeep(constantRoutes);

/** 用于渲染菜单，保持原始层级 */
export const constantMenus: Array<RouteComponent> = ascending(
  routes.flat(Infinity)
).concat(...remainingRouter);

/** 不参与菜单的路由 */
export const remainingPaths: string[] = Object.keys(remainingRouter)
  .map(k => (remainingRouter as any)[k]?.path)
  .filter((p): p is string => typeof p === 'string');

/** 创建路由实例 */
export const router: Router = createRouter({
  history: getHistoryMode(import.meta.env.VITE_ROUTER_HISTORY),
  routes: constantRoutes.concat(...(remainingRouter as any)),
  strict: true,
  scrollBehavior(_to, from, savedPosition) {
    return new Promise(resolve => {
      if (savedPosition) {
        resolve(savedPosition);
      } else if (from.meta.saveSrollTop) {
        const top: number =
          document.documentElement.scrollTop || document.body.scrollTop;
        resolve({ left: 0, top });
      } else {
        resolve(undefined);
      }
    });
  }
});

/** 记录已经加载的页面路径 */
const loadedPaths = new Set<string>();

/** 重置已加载页面记录 */
export function resetLoadedPaths() {
  loadedPaths.clear();
}

/** 重置路由 */
export function resetRouter() {
  router.clearRoutes();
  for (const route of initConstantRoutes.concat(...(remainingRouter as any))) {
    router.addRoute(route);
  }
  router.options.routes = formatTwoStageRoutes(
    formatFlatteningRoutes(buildHierarchyTree(ascending(routes.flat(Infinity))))
  );
  usePermissionStoreHook().clearAllCachePage();
  resetLoadedPaths();
}

router.beforeEach((to: ToRouteType, _from) => {
  to.meta.loaded = loadedPaths.has(to.path);

  if (!to.meta.loaded) {
    NProgress.start();
  }

  if (to.meta?.keepAlive) {
    handleAliveRoute(to, 'add');
    // 页面整体刷新和点击标签页刷新
    if (_from.name === undefined || _from.name === 'Redirect') {
      handleAliveRoute(to);
    }
  }
  if (!isUrl(to?.name as string)) {
    to.matched.forEach(item => {
      if (!item.meta.title) return;
      const Title = getConfig().Title;
      if (Title)
        document.title = `${transformI18n(item.meta.title)} | ${Title}`;
      else document.title = transformI18n(item.meta.title);
    });
  }
  /** 访问控制决策委托给 permissionGuard */
  const result = permissionGuard(to, _from, { router });
  // externalLink 分支返回 false 中止导航，vue-router 不触发 afterEach，
  // 需手动收尾 NProgress 防止进度条挂起（重构前原码在 guards 内调用，现移至调用方）
  if (result === false) NProgress.done();
  return result;
});

router.afterEach(to => {
  loadedPaths.add(to.path);
  NProgress.done();
});

export default router;
