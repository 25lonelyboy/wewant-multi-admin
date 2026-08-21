// user 域契约一致性：UserView 序列化形态钉住 contracts UserVO
import type { UserVO } from '@multi-admin/contracts';
import type { UserView } from './user.service.js';

describe('user 域契约一致性', () => {
  it('UserView 序列化形态 = UserVO', () => {
    const view = {
      id: 'u1',
      username: 'admin',
      nickname: '超级管理员',
      status: 'ACTIVE',
      avatar: null,
      phone: null,
      email: null,
      sex: null,
      remark: null,
      roles: ['admin'],
      createdAt: new Date(),
      updatedAt: new Date()
    } satisfies UserView;
    // 序列化形态（Date → ISO 字符串）直接赋给 UserVO：编译期钉住字段集与类型，漂移即红
    const vo: UserVO = {
      ...view,
      status: 'ACTIVE',
      sex: null,
      createdAt: view.createdAt.toISOString(),
      updatedAt: view.updatedAt.toISOString()
    };
    expect(vo.createdAt).toEqual(expect.any(String));
  });
});
