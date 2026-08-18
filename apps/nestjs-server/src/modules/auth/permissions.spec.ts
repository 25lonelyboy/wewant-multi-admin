import { derivePermissions, type MenuPermissionRow } from './permissions.js';

const rows: MenuPermissionRow[] = [
  { type: 'MENU', permission: null },
  { type: 'BUTTON', permission: 'system:user:query' },
  { type: 'BUTTON', permission: 'system:user:add' },
  { type: 'BUTTON', permission: 'system:user:query' }
];

describe('derivePermissions', () => {
  it('admin 角色返回通配集', () => {
    expect(derivePermissions(rows, ['admin', 'common'])).toEqual(['*:*:*']);
  });

  it('普通角色：BUTTON 权限去重、忽略 MENU 空值', () => {
    expect(derivePermissions(rows, ['common'])).toEqual([
      'system:user:query',
      'system:user:add'
    ]);
  });

  it('无关联菜单（空角色查询结果）返回空集', () => {
    expect(derivePermissions([], ['common'])).toEqual([]);
  });
});
