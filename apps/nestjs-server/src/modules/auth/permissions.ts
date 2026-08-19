export interface MenuPermissionRow {
  type: 'MENU' | 'IFRAME' | 'EXTERNAL' | 'BUTTON';
  permission: string | null;
}

/**
 * 权限点集合 = 各角色关联 Menu.permission 非空集合（BUTTON 型）；
 * admin 角色返回通配集（与 pure-web mock 一致）。
 */
export function derivePermissions(
  menus: MenuPermissionRow[],
  roleCodes: string[]
): string[] {
  if (roleCodes.includes('admin')) return ['*:*:*'];
  return [
    ...new Set(
      menus.map(m => m.permission).filter((p): p is string => p !== null)
    )
  ];
}
