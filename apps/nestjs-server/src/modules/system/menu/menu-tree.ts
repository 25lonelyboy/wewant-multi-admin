// src/modules/system/menu/menu-tree.ts
export interface MenuTreeRow {
  id: string;
  parentId: string | null;
  sort: number;
}

export type MenuTreeNodeOf<T extends MenuTreeRow> = T & {
  children: MenuTreeNodeOf<T>[];
};

/**
 * 全量活跃菜单组装树：按 sort 升序；仅从根（parentId=null）出发，
 * 已软删父节点的孤儿子树自然不可见（分设计 §4.3）。
 */
export function buildMenuTree<T extends MenuTreeRow>(
  rows: T[]
): MenuTreeNodeOf<T>[] {
  const sorted = [...rows].sort((a, b) => a.sort - b.sort);
  const byParent = new Map<string | null, T[]>();
  for (const node of sorted) {
    const list = byParent.get(node.parentId) ?? [];
    list.push(node);
    byParent.set(node.parentId, list);
  }
  const toNode = (node: T): MenuTreeNodeOf<T> => ({
    ...node,
    children: (byParent.get(node.id) ?? []).map(toNode)
  });
  return (byParent.get(null) ?? []).map(toNode);
}
