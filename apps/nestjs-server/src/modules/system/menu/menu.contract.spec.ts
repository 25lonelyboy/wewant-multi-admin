// menu 域契约一致性：Menu 行 + children 的序列化形态钉住 MenuVO
import { MenuType, type MenuVO } from '@multi-admin/contracts';

describe('menu 域契约一致性', () => {
  it('菜单树节点形态 = MenuVO', () => {
    // 字面量直接赋给契约类型：字段/枚举漂移即编译红（含多余属性检查）
    const vo: MenuVO = {
      id: 'm1',
      parentId: null,
      type: 'MENU',
      name: 'System',
      title: 'menus.pureSysManagement',
      icon: 'ri:settings-3-line',
      path: '/system',
      component: null,
      permission: null,
      sort: 0,
      visible: true,
      meta: null,
      createdAt: '2026-08-22T00:00:00.000Z',
      updatedAt: '2026-08-22T00:00:00.000Z',
      deletedAt: null,
      children: []
    };
    expect(vo.type).toBe(MenuType.MENU);
  });
});
