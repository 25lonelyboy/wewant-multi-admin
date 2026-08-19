/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import * as argon2 from 'argon2';
import { UserService } from './user.service.js';
import type { PrismaService } from '../../../database/prisma.service.js';
import { BizCode } from '../../../common/errors/biz-code.js';

jest.mock('argon2', () => ({ hash: jest.fn() }));

const OPERATOR_ID = 'op1';

const USER_ROW = {
  id: 'u1',
  username: 'zhangsan',
  password: 'hash',
  nickname: '张三',
  status: 'ACTIVE',
  avatar: null,
  phone: null,
  email: null,
  sex: null,
  remark: null,
  createdAt: new Date('2026-08-19T00:00:00Z'),
  updatedAt: new Date('2026-08-19T00:00:00Z'),
  roles: [] as Array<{ roleId: string; role: { code: string } }>
};

describe('UserService', () => {
  let service: UserService;
  let prisma: {
    user: {
      findFirst: jest.Mock;
      findMany: jest.Mock;
      count: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
    };
    userRole: {
      findMany: jest.Mock;
      deleteMany: jest.Mock;
      createMany: jest.Mock;
    };
    role: { findMany: jest.Mock };
    $transaction: jest.Mock;
  };

  beforeEach(() => {
    prisma = {
      user: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
        create: jest.fn(),
        update: jest.fn()
      },
      userRole: {
        findMany: jest.fn(),
        deleteMany: jest.fn(),
        createMany: jest.fn()
      },
      role: { findMany: jest.fn() },
      $transaction: jest.fn()
    };
    service = new UserService(prisma as unknown as PrismaService);
    (argon2.hash as jest.Mock).mockResolvedValue('hashed');
  });

  describe('list', () => {
    it('带软删过滤的分页查询，view 剔除 password、roles 为 code 数组', async () => {
      prisma.$transaction.mockResolvedValue([[USER_ROW], 1]);
      const result = await service.list({});
      expect(prisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ deletedAt: null }),
          skip: 0,
          take: 10
        })
      );
      expect(result).toEqual({
        items: [expect.objectContaining({ username: 'zhangsan', roles: [] })],
        total: 1,
        page: 1,
        pageSize: 10
      });
      expect(result.items[0]).not.toHaveProperty('password');
    });
  });

  describe('create', () => {
    it('username 预查重命中 → 40900', async () => {
      prisma.user.findFirst.mockResolvedValue({ id: 'dup' });
      await expect(
        service.create({
          username: 'zhangsan',
          password: 'P@ssw0rd!',
          nickname: '张三'
        })
      ).rejects.toMatchObject({ code: BizCode.CONFLICT });
    });

    it('roleIds 含不存在/已删角色 → 40001（护栏 7）', async () => {
      prisma.user.findFirst.mockResolvedValue(null);
      prisma.role.findMany.mockResolvedValue([]);
      await expect(
        service.create({
          username: 'a',
          password: 'P@ssw0rd!',
          nickname: 'n',
          roleIds: ['ghost']
        })
      ).rejects.toMatchObject({ code: BizCode.VALIDATION_FAILED });
    });

    it('创建成功：argon2 哈希 + 角色关联 + 默认 ACTIVE（护栏 5）', async () => {
      prisma.user.findFirst.mockResolvedValue(null);
      prisma.role.findMany.mockResolvedValue([{ id: 'r1' }]);
      prisma.user.create.mockResolvedValue({
        ...USER_ROW,
        roles: [{ roleId: 'r1', role: { code: 'common' } }]
      });
      const view = await service.create({
        username: 'zhangsan',
        password: 'P@ssw0rd!',
        nickname: '张三',
        roleIds: ['r1']
      });
      expect(argon2.hash).toHaveBeenCalledWith('P@ssw0rd!');
      expect(prisma.user.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            password: 'hashed',
            status: 'ACTIVE',
            roles: { create: [{ roleId: 'r1' }] }
          })
        })
      );
      expect(view.roles).toEqual(['common']);
    });
  });

  describe('update 护栏', () => {
    it('禁用超管用户 → 40900（护栏 1）', async () => {
      prisma.user.findFirst.mockResolvedValue({
        ...USER_ROW,
        username: 'admin'
      });
      await expect(
        service.update('u1', { status: 'DISABLED' }, OPERATOR_ID)
      ).rejects.toMatchObject({ code: BizCode.CONFLICT });
    });

    it('禁用自己 → 40900（护栏 2）', async () => {
      prisma.user.findFirst.mockResolvedValue(USER_ROW);
      await expect(
        service.update('u1', { status: 'DISABLED' }, 'u1')
      ).rejects.toMatchObject({ code: BizCode.CONFLICT });
    });

    it('修改自己的角色分配 → 40900（护栏 3）', async () => {
      prisma.user.findFirst.mockResolvedValue(USER_ROW);
      await expect(
        service.update('u1', { roleIds: ['r1'] }, 'u1')
      ).rejects.toMatchObject({ code: BizCode.CONFLICT });
    });

    it('目标不存在/已删 → 40404', async () => {
      prisma.user.findFirst.mockResolvedValue(null);
      await expect(
        service.update('ghost', { nickname: 'x' }, OPERATOR_ID)
      ).rejects.toMatchObject({ code: BizCode.NOT_FOUND });
    });

    it('成功路径：事务内整体替换角色 + 更新字段（含 password 可选重哈希）', async () => {
      prisma.user.findFirst.mockResolvedValue(USER_ROW);
      prisma.role.findMany.mockResolvedValue([{ id: 'r1' }]);
      prisma.$transaction.mockImplementation(
        async (fn: (tx: unknown) => Promise<unknown>) => fn(prisma)
      );
      prisma.user.update.mockResolvedValue({ ...USER_ROW, nickname: '新名' });
      const view = await service.update(
        'u1',
        { nickname: '新名', password: 'NewP@ss1', roleIds: ['r1'] },
        OPERATOR_ID
      );
      expect(argon2.hash).toHaveBeenCalledWith('NewP@ss1');
      expect(prisma.userRole.deleteMany).toHaveBeenCalledWith({
        where: { userId: 'u1' }
      });
      expect(prisma.userRole.createMany).toHaveBeenCalledWith({
        data: [{ userId: 'u1', roleId: 'r1' }]
      });
      expect(view.nickname).toBe('新名');
    });
  });

  describe('remove（软删除）', () => {
    it('目标不存在/已删 → 40404', async () => {
      prisma.user.findFirst.mockResolvedValue(null);
      await expect(service.remove('u1', OPERATOR_ID)).rejects.toMatchObject({
        code: BizCode.NOT_FOUND
      });
    });

    it('禁删超管 → 40900；禁删自己 → 40900', async () => {
      prisma.user.findFirst.mockResolvedValue({
        ...USER_ROW,
        username: 'admin'
      });
      await expect(service.remove('u1', OPERATOR_ID)).rejects.toMatchObject({
        code: BizCode.CONFLICT
      });
      prisma.user.findFirst.mockResolvedValue(USER_ROW);
      await expect(service.remove('u1', 'u1')).rejects.toMatchObject({
        code: BizCode.CONFLICT
      });
    });

    it('软删除写 deletedAt 时间戳（不发生任何硬删除）', async () => {
      prisma.user.findFirst.mockResolvedValue(USER_ROW);
      prisma.user.update.mockResolvedValue(USER_ROW);
      await service.remove('u1', OPERATOR_ID);
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'u1' },
        data: { deletedAt: expect.any(Date) }
      });
    });
  });

  describe('roles 子资源', () => {
    it('rolesOf 只返回活跃角色且先校验主体存活', async () => {
      prisma.user.findFirst.mockResolvedValue(USER_ROW);
      prisma.userRole.findMany.mockResolvedValue([
        { roleId: 'r1' },
        { roleId: 'r2' }
      ]);
      await expect(service.roleIdsOf('u1')).resolves.toEqual(['r1', 'r2']);
      expect(prisma.userRole.findMany).toHaveBeenCalledWith({
        where: { userId: 'u1', role: { deletedAt: null } },
        select: { roleId: true }
      });
    });

    it('setRoles 对自己 → 40900（护栏 3）', async () => {
      prisma.user.findFirst.mockResolvedValue(USER_ROW);
      await expect(service.setRoles('u1', ['r1'], 'u1')).rejects.toMatchObject({
        code: BizCode.CONFLICT
      });
    });

    it('setRoles 成功：事务 deleteMany + createMany（幂等整体替换）', async () => {
      prisma.user.findFirst.mockResolvedValue(USER_ROW);
      prisma.role.findMany.mockResolvedValue([{ id: 'r1' }, { id: 'r2' }]);
      prisma.userRole.deleteMany.mockReturnValue({});
      prisma.userRole.createMany.mockReturnValue({});
      prisma.$transaction.mockResolvedValue(undefined);
      await expect(
        service.setRoles('u1', ['r1', 'r2'], OPERATOR_ID)
      ).resolves.toEqual(['r1', 'r2']);
      expect(prisma.$transaction).toHaveBeenCalledWith([
        expect.anything(),
        expect.anything()
      ]);
    });
  });
});
