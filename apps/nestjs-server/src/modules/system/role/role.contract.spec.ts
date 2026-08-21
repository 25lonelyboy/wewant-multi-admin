// role 域契约一致性：RoleView 序列化形态钉住 contracts RoleVO；all() 形状钉住 RoleOption
import type { RoleOption, RoleVO } from '@multi-admin/contracts';
import type { RoleView } from './role.service.js';

describe('role 域契约一致性', () => {
  it('RoleView 序列化形态 = RoleVO', () => {
    const view = {
      id: 'r1',
      code: 'editor',
      name: '编辑',
      status: 'ACTIVE',
      remark: null,
      createdAt: new Date(),
      updatedAt: new Date()
    } satisfies RoleView;
    // 序列化形态（Date → ISO 字符串）直接赋给 RoleVO：编译期钉住字段集与类型，漂移即红
    const vo: RoleVO = {
      ...view,
      status: 'ACTIVE',
      createdAt: view.createdAt.toISOString(),
      updatedAt: view.updatedAt.toISOString()
    };
    expect(vo.createdAt).toEqual(expect.any(String));
  });

  it('all() 下拉选项形状 = RoleOption', () => {
    const option = {
      id: 'r1',
      name: '编辑',
      code: 'editor'
    } satisfies RoleOption;
    expect(option).toEqual({ id: 'r1', name: '编辑', code: 'editor' });
  });
});
