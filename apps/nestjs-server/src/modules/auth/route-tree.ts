export interface MenuRouteRow {
  id: string;
  parentId: string | null;
  type: 'MENU' | 'BUTTON';
  name: string;
  title: string;
  icon: string | null;
  path: string | null;
  component: string | null;
  sort: number;
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
  };
  children?: RouteNode[];
}

/**
 * MENU 型节点按 parentId 组装树：
 * 顶层组带 rank（sort），叶子带 name/component 与可见角色集；按 sort 升序。
 */
export function buildRouteTree(
  menus: MenuRouteRow[],
  roleCodes: string[]
): RouteNode[] {
  const nodes = menus
    .filter(m => m.type === 'MENU')
    .sort((a, b) => a.sort - b.sort);
  const byParent = new Map<string | null, MenuRouteRow[]>();
  for (const node of nodes) {
    const list = byParent.get(node.parentId) ?? [];
    list.push(node);
    byParent.set(node.parentId, list);
  }

  const toNode = (menu: MenuRouteRow, isTop: boolean): RouteNode => {
    const children = (byParent.get(menu.id) ?? []).map(c => toNode(c, false));
    const node: RouteNode = {
      path: menu.path ?? '',
      meta: isTop
        ? { rank: menu.sort, title: menu.title }
        : { title: menu.title, roles: roleCodes }
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
