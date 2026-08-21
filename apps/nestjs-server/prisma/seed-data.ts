// prisma/seed-data.ts
// 菜单/权限点种子静态数据：为 apps/pure-web/mock/asyncRoutes.ts 的真子集（P5 裁剪：
// Dept/Monitor 域后端未实现；asyncRoutes 仍含 SystemDept/Monitor，seed 不含）；
// 纯数据无副作用，供 seed.ts 与单测共享。

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
      }
    ]
  }
];

/** system 组 3 页 × 4 动作 = 12 个按钮权限点（P3 端点按此粒度对齐） */
export const BUTTON_ACTIONS = ['query', 'add', 'update', 'delete'] as const;

/** 页面路由名 → 权限点前缀（system:user:add 形态） */
export const PAGE_PERMISSION_PREFIX: Record<string, string> = {
  SystemUser: 'system:user',
  SystemRole: 'system:role',
  SystemMenu: 'system:menu'
};

export const ROLES = [
  { code: 'admin', name: '管理员' },
  { code: 'common', name: '普通用户' }
] as const;
