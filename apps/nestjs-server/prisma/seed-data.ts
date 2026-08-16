// prisma/seed-data.ts
// 菜单/权限点种子静态数据：与 apps/pure-web/mock/asyncRoutes.ts 一一对齐；
// 纯数据无副作用，供 seed.ts 与单测共用。

export interface MenuSeedItem {
  name: string;
  title: string; // i18n key
  icon?: string;
  path?: string;
  component?: string;
  sort: number;
  children?: MenuSeedItem[];
}

export const MENU_TREE: MenuSeedItem[] = [
  {
    name: 'System',
    title: 'menus.pureSysManagement',
    icon: 'ri:settings-3-line',
    path: '/system',
    sort: 0,
    children: [
      {
        name: 'SystemUser',
        title: 'menus.pureUser',
        icon: 'ri:admin-line',
        path: '/system/user/index',
        sort: 0
      },
      {
        name: 'SystemRole',
        title: 'menus.pureRole',
        icon: 'ri:admin-fill',
        path: '/system/role/index',
        sort: 1
      },
      {
        name: 'SystemMenu',
        title: 'menus.pureSystemMenu',
        icon: 'ep:menu',
        path: '/system/menu/index',
        sort: 2
      },
      {
        name: 'SystemDept',
        title: 'menus.pureDept',
        icon: 'ri:git-branch-line',
        path: '/system/dept/index',
        sort: 3
      }
    ]
  },
  {
    name: 'Monitor',
    title: 'menus.pureSysMonitor',
    icon: 'ep:monitor',
    path: '/monitor',
    sort: 1,
    children: [
      {
        name: 'OnlineUser',
        title: 'menus.pureOnlineUser',
        icon: 'ri:user-voice-line',
        path: '/monitor/online-user',
        component: 'monitor/online/index',
        sort: 0
      },
      {
        name: 'LoginLog',
        title: 'menus.pureLoginLog',
        icon: 'ri:window-line',
        path: '/monitor/login-logs',
        component: 'monitor/logs/login/index',
        sort: 1
      },
      {
        name: 'OperationLog',
        title: 'menus.pureOperationLog',
        icon: 'ri:history-fill',
        path: '/monitor/operation-logs',
        component: 'monitor/logs/operation/index',
        sort: 2
      },
      {
        name: 'SystemLog',
        title: 'menus.pureSystemLog',
        icon: 'ri:file-search-line',
        path: '/monitor/system-logs',
        component: 'monitor/logs/system/index',
        sort: 3
      }
    ]
  }
];

/** system 组 4 页 × 4 动作 = 16 个按钮权限点（P3 端点按此粒度对齐） */
export const BUTTON_ACTIONS = ['query', 'add', 'update', 'delete'] as const;

/** 页面路由名 → 权限点前缀（system:user:add 形态） */
export const PAGE_PERMISSION_PREFIX: Record<string, string> = {
  SystemUser: 'system:user',
  SystemRole: 'system:role',
  SystemMenu: 'system:menu',
  SystemDept: 'system:dept'
};

export const ROLES = [
  { code: 'admin', name: '管理员' },
  { code: 'common', name: '普通用户' }
] as const;
