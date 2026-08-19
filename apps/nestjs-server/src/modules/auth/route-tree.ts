import type { MenuMeta } from '../system/shared/system-shared.js';

export interface MenuRouteRow {
  id: string;
  parentId: string | null;
  type: 'MENU' | 'IFRAME' | 'EXTERNAL' | 'BUTTON';
  name: string;
  title: string;
  icon: string | null;
  path: string | null;
  component: string | null;
  sort: number;
  visible: boolean;
  meta: MenuMeta | null;
}

export interface RouteNode {
  path: string;
  name?: string;
  component?: string;
  meta: {
    icon?: string;
    title: string;
    rank?: number;
    roles?: string[];
    showLink?: boolean;
  } & Partial<MenuMeta>;
  children?: RouteNode[];
}

/**
 * 路由型节点（MENU/IFRAME/EXTERNAL）按 parentId 组装树：
 * 顶层组带 rank（sort），叶子带 name/component 与可见角色集；按 sort 升序。
 * showLink = visible（单一语义源，分设计 §3.3）；meta Json 写时校验、读时透传。
 */
export function buildRouteTree(
  menus: MenuRouteRow[],
  roleCodes: string[]
): RouteNode[] {
  const nodes = menus
    .filter(m => m.type !== 'BUTTON')
    .sort((a, b) => a.sort - b.sort);
  const byParent = new Map<string | null, MenuRouteRow[]>();
  for (const node of nodes) {
    const list = byParent.get(node.parentId) ?? [];
    list.push(node);
    byParent.set(node.parentId, list);
  }

  const toNode = (menu: MenuRouteRow, isTop: boolean): RouteNode => {
    const children = (byParent.get(menu.id) ?? []).map(c => toNode(c, false));
    // meta 透传先展开，内置字段（title/rank/roles/showLink/icon）后置写入防覆盖
    const node: RouteNode = {
      path: menu.path ?? '',
      meta: {
        ...(menu.meta ?? {}),
        title: menu.title,
        showLink: menu.visible,
        ...(isTop ? { rank: menu.sort } : { roles: roleCodes })
      }
    };
    if (menu.icon) node.meta.icon = menu.icon;
    if (!isTop) {
      node.name = menu.name;
      if (menu.component) node.component = menu.component;
    }
    if (children.length > 0) node.children = children;
    return node;
  };

  return (byParent.get(null) ?? []).map(m => toNode(m, true));
}
